import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { ethers } from 'ethers';
import { ConfigService } from '@nestjs/config';
import { GelatoRelay, SponsoredCallRequest } from '@gelatonetwork/relay-sdk';
import { TransactionsService } from 'src/transaction/transactions.service';
import { Queue } from 'bullmq';

@Injectable()
export class Web3Service implements OnModuleInit {
  private arbitrumProvider: ethers.JsonRpcProvider;
  private optimismProvider: ethers.JsonRpcProvider;
  private walletArbitrum: ethers.Wallet;
  private walletOptimism: ethers.Wallet;
  private arbitrumContract: ethers.Contract;
  private optimismContract: ethers.Contract;
  private relay: GelatoRelay;
  private GELATO_API_KEY: string;
  private contractAbi: string[];
  private mintQueue: Queue;

  constructor(
    private configService: ConfigService,
    private readonly transactionsService: TransactionsService,
  ) {
    console.log('Initializing web3 service');
    // Setup Providers
    this.arbitrumProvider = new ethers.JsonRpcProvider(
      this.configService.get<string>('ARBITRUM_RPC'),
    );
    this.optimismProvider = new ethers.JsonRpcProvider(
      this.configService.get<string>('OPTIMISM_RPC'),
    );

    // ✅ Ensure private key has "0x" prefix
    const privKey = this.configService.get<string>('PRIVATE_KEY');
    const formattedPrivateKey = privKey.startsWith('0x')
      ? privKey
      : `0x${privKey}`;

    // Load Wallet
    this.walletArbitrum = new ethers.Wallet(
      formattedPrivateKey,
      this.arbitrumProvider,
    );

    this.walletOptimism = new ethers.Wallet(
      formattedPrivateKey,
      this.optimismProvider,
    );

    // this.wallet = new ethers.Wallet(formattedPrivateKey, this.arbitrumProvider);

    // Gelato Relay
    this.relay = new GelatoRelay();
    this.GELATO_API_KEY = this.configService.get<string>('GELATO_API_KEY');

    // Contract Addresses & ABI
    const arbitrumContractAddress =
      this.configService.get<string>('ARBITRUM_CONTRACT');
    const optimismContractAddress =
      this.configService.get<string>('OPTIMISM_CONTRACT');
    this.contractAbi = [
      'event TokensBurned(address indexed user, uint256 amount)',
      'event TokensMinted(address indexed user, uint256 amount)',
      'event Transfer(address indexed from, address indexed to, uint256 value)',
      'function burn(uint256 amount) external',
      'function mint(address to, uint256 amount) external',
      'function transfer(address to, uint256 amount) external returns (bool)', // ✅ Ensure it has `returns (bool)`
      'function balanceOf(address owner) external view returns (uint256)',
      'function bridgeOperator() external view returns (address)',
    ];

    // Connect Contracts
    this.arbitrumContract = new ethers.Contract(
      arbitrumContractAddress,
      this.contractAbi,
      this.walletArbitrum,
    ) as ethers.Contract;

    this.optimismContract = new ethers.Contract(
      optimismContractAddress,
      this.contractAbi,
      this.walletOptimism,
    ) as ethers.Contract;

    this.mintQueue = new Queue('gelatoMintQueue', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
      },
    });

    this.schedulePeriodicCheck();
  }

  async onModuleInit() {
    console.log('Listening to burn events on Arbitrum & Optimism...');
    await this.listenToBurnEvents();
  }

  async burnTokens(
    user: string,
    amount: string,
    network: 'arbitrum' | 'optimism',
    signature: string,
  ) {
    console.log(`Burning ${amount} tokens for ${user} on ${network}`);

    // ✅ Get contract & signer
    const contractAddress =
      network === 'arbitrum'
        ? this.configService.get<string>('ARBITRUM_CONTRACT')
        : this.configService.get<string>('OPTIMISM_CONTRACT');

    if (!contractAddress) {
      throw new BadRequestException(
        'Contract address is missing for the selected network',
      );
    }

    const signer =
      network === 'arbitrum' ? this.walletArbitrum : this.walletOptimism;
    const contractAbi = [
      'function burnFrom(address user, uint256 amount) external',
    ];
    const contract = new ethers.Contract(contractAddress, contractAbi, signer);

    // 🔹 Validate User's Signature
    const messageHash = ethers.solidityPackedKeccak256(
      ['address', 'uint256'],
      [contractAddress, ethers.parseEther(amount)],
    );
    const recoveredSigner = ethers.verifyMessage(
      ethers.getBytes(messageHash),
      signature,
    );

    if (recoveredSigner.toLowerCase() !== user.toLowerCase()) {
      throw new BadRequestException('Signature verification failed!');
    }

    // Burn Tokens Directly from User
    console.log('Sending burn transaction...');
    const burnAmount = ethers.parseEther(amount);
    const tx = await contract.burnFrom(user, burnAmount);
    await tx.wait();

    // Save transaction in database
    await this.transactionsService.saveTransaction({
      user,
      network,
      type: 'burn',
      amount,
      txHash: tx.hash,
      status: 'completed',
    });

    console.log(`Burn successful on ${network}. TX: ${tx.hash}`);

    return { success: true, txHash: tx.hash };
  }

  /**
   * 🚀 Mint Tokens using Gelato (Triggered by Event Listeners)
   */
  async mintTokensUsingGelato(
    user: string,
    amount: string,
    targetNetwork: 'arbitrum' | 'optimism',
    txHashOriginator: string,
  ) {
    console.log(`🚀 Minting to ${user} on ${targetNetwork} via Gelato`);

    // ✅ Get the contract address for the target network
    const contractAddress =
      targetNetwork === 'arbitrum'
        ? this.configService.get<string>('ARBITRUM_CONTRACT')
        : this.configService.get<string>('OPTIMISM_CONTRACT');

    if (!contractAddress) {
      throw new Error('❌ Contract address is missing for target network');
    }

    const signer =
      targetNetwork === 'arbitrum' ? this.walletArbitrum : this.walletOptimism;

    // ✅ Initialize contract with the signer (Bridge Operator)
    const contractAbi = ['function mint(address to, uint256 amount) external'];
    const contract = new ethers.Contract(contractAddress, contractAbi, signer);

    // ✅ Encode mint transaction
    const mintAmount = ethers.parseEther(amount.toString());
    const mintTxData = contract.interface.encodeFunctionData('mint', [
      user,
      mintAmount,
    ]);

    console.log('🔹 Encoded Mint Transaction Data:', mintTxData);

    // ✅ **Sign the transaction before sending to Gelato**
    const tx = {
      to: contractAddress,
      data: mintTxData,
      gasLimit: ethers.toBigInt('500000'), // Adjust gas limit if needed
    };

    const signedTx = await signer.signTransaction(tx);
    // console.log('🔹 Signed Mint Transaction:', signedTx);

    // 🔹 **Submit the signed transaction via Gelato Relay**
    const relayRequest: SponsoredCallRequest = {
      chainId: BigInt(targetNetwork === 'arbitrum' ? 421614 : 11155420), // Arbitrum Sepolia / Optimism Sepolia
      target: contractAddress,
      data: mintTxData,
    };

    const { taskId } = await this.relay.sponsoredCall(
      relayRequest,
      this.configService.get<string>('GELATO_API_KEY'),
    );

    // Save mint transaction in database
    await this.transactionsService.updateTransactionByLastTx(txHashOriginator, {
      status: 'processing',
      gelatoTaskId: taskId,
    });

    // await this.transactionsService.saveTransaction({
    //   user,
    //   network: targetNetwork,
    //   type: 'mint',
    //   amount,
    //   gelatoTaskId: taskId,
    //   status: 'pending',
    // });

    console.log(`✅ Mint request sent via Gelato. Task ID: ${taskId}`);
    return { success: true, taskId };
  }

  /**
   * 📡 Event Listener for Burn Events
   * - Detects burns and triggers minting on the opposite network
   */
  async listenToBurnEvents() {
    console.log('🚀 Listening for burn events on Arbitrum & Optimism...');

    const burnEventTopic = ethers.id('TokensBurned(address,uint256)');
    let lastArbitrumBlock = await this.arbitrumProvider.getBlockNumber();
    let lastOptimismBlock = await this.optimismProvider.getBlockNumber();
    const processedTxs = new Set<string>();

    const pollLogs = async (
      provider: ethers.JsonRpcProvider,
      contract: ethers.Contract,
      network: string,
      targetNetwork: string,
      lastCheckedBlock: number,
    ) => {
      try {
        const currentBlock = await provider.getBlockNumber();
        if (lastCheckedBlock === currentBlock) {
          console.log(`🔍 No new blocks on ${network}, skipping poll.`);
          return currentBlock;
        }

        // console.log(
        //   `Fetching logs from blocks ${lastCheckedBlock} to ${currentBlock} on ${network}...`,
        // );
        const logs = await provider.getLogs({
          address: contract.target,
          topics: [burnEventTopic],
          fromBlock: lastCheckedBlock + 1,
          toBlock: currentBlock,
        });

        for (const log of logs) {
          if (processedTxs.has(log.transactionHash)) {
            console.log(`Already processed tx: ${log.transactionHash}`);
            continue;
          }

          const parsedLog = contract.interface.parseLog(log);

          // console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
          // console.log('details of event');
          // console.log('log', log);
          // console.log('log.transactionHash', log.transactionHash);
          // console.log('parsedLog', parsedLog);
          // console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
          const { user, amount } = parsedLog.args;

          console.log(
            `Burn event detected on ${network}: ${ethers.formatEther(amount)} tokens from ${user}`,
          );

          // save its future transaction entry, so that i can show its detail on client side
          console.log(
            'Saving future mint transaction handle, for originating tx',
            log.transactionHash,
          );
          await this.transactionsService.saveTransaction({
            user,
            network: network === 'arbitrum' ? 'arbitrum' : 'optimism',
            type: 'mint',
            amount: ethers.formatEther(amount),
            txHashOriginator: log.transactionHash,
            status: 'pending',
          });

          await this.mintQueue.add(
            'gelatoMintJob',
            {
              user,
              amount: ethers.formatEther(amount),
              targetNetwork,
              txHashOriginator: log.transactionHash,
            },
            {
              attempts: 3, // Max retries
              backoff: {
                type: 'exponential', // Retry delay increases exponentially
                delay: 5000, // Initial retry delay: 5 sec
              },
            },
          );

          console.log(`Event published to Redis`);

          processedTxs.add(log.transactionHash);
        }

        return currentBlock;
      } catch (error) {
        console.error(`Error fetching logs for ${network}:`, error);
        return lastCheckedBlock;
      }
    };

    setInterval(async () => {
      console.log('🔄 Polling for new burn events...');
      lastArbitrumBlock = await pollLogs(
        this.arbitrumProvider,
        this.arbitrumContract,
        'Arbitrum',
        'optimism',
        lastArbitrumBlock,
      );
      lastOptimismBlock = await pollLogs(
        this.optimismProvider,
        this.optimismContract,
        'Optimism',
        'arbitrum',
        lastOptimismBlock,
      );
    }, 15000);

    console.log('✅ Started polling for burn events (no eth_newFilter)');
  }

  /**
   * 💰 Get User Balance on Both Networks
   */
  async getUserBalance(userAddress: string) {
    try {
      // Fetch balances from both networks
      const balanceArbitrum =
        await this.arbitrumContract.balanceOf(userAddress);
      const balanceOptimism =
        await this.optimismContract.balanceOf(userAddress);

      return {
        arbitrumBalance: ethers.formatEther(balanceArbitrum),
        optimismBalance: ethers.formatEther(balanceOptimism),
      };
    } catch (error) {
      console.error('Error fetching user balance:', error);
      throw new Error('Failed to fetch user balance.');
    }
  }

  //////////// Admin methods ///////////////
  // **Self Mint Tokens (Bridge Operator)**
  async selfMintTokens(amount: bigint, network: 'arbitrum' | 'optimism') {
    console.log(`🚀 Minting ${amount} tokens to Bridge Operator on ${network}`);

    const targetContract =
      network === 'arbitrum' ? this.arbitrumContract : this.optimismContract;
    const operatorWallet =
      network === 'arbitrum'
        ? await this.walletArbitrum.getAddress()
        : await this.walletOptimism.getAddress();

    // const currentBridgeOperator = await targetContract.bridgeOperator();
    // console.log(
    //   `🔹 Current Bridge Operator on ${network}: ${currentBridgeOperator}`,
    // );
    // if (currentBridgeOperator.toLowerCase() !== operatorWallet.toLowerCase()) {
    //   console.error('❌ Bridge Operator mismatch! Cannot mint.');
    //   return;
    // }

    const tx = await targetContract.mint(
      operatorWallet,
      ethers.parseEther(amount.toString()),
    );
    await tx.wait();

    console.log(`Minted ${amount} tokens to Bridge Operator on ${network}`);
    return { success: true, txHash: tx.hash };
  }

  // Get Bridge Operator Self-Balance
  async getSelfBalance() {
    const walletArbitrumAddress = await this.walletArbitrum.getAddress();
    const walletOptimismAddress = await this.walletOptimism.getAddress();

    console.log('🔍 Checking self balance for wallet:', walletArbitrumAddress);

    try {
      // Fetch balances in parallel
      const [balanceArbitrum, balanceOptimism] = await Promise.all([
        this.arbitrumContract.balanceOf(walletArbitrumAddress),
        this.optimismContract.balanceOf(walletOptimismAddress),
      ]);

      console.log('balanceArbitrum', ethers.formatEther(balanceArbitrum));
      console.log('balanceOptimism', ethers.formatEther(balanceOptimism));

      return {
        walletArbitrumAddress: walletArbitrumAddress,
        walletOptimismAddress: walletOptimismAddress,
        arbitrumBalance: ethers.formatEther(balanceArbitrum),
        optimismBalance: ethers.formatEther(balanceOptimism),
      };
    } catch (error) {
      console.error('❌ Error fetching balances:', error);
      throw new Error('Failed to fetch balances');
    }
  }

  // Mint Tokens to User from Bridge Operator (Optional)
  async mintTokensToUser(
    to: string,
    amount: string,
    network: 'arbitrum' | 'optimism',
  ) {
    console.log(
      `🚀 Sending ${amount} tokens from Bridge Operator to ${to} on ${network}`,
    );

    const targetContract =
      network === 'arbitrum' ? this.arbitrumContract : this.optimismContract;
    const bridgeOperator =
      network === 'arbitrum'
        ? await this.walletArbitrum.getAddress()
        : await this.walletOptimism.getAddress();

    console.log('🔍 Checking Bridge Operator balance...');
    const balance = await targetContract.balanceOf(bridgeOperator);
    console.log(`💰 Current Balance: ${ethers.formatEther(balance)} tokens`);

    // ❌ Ensure enough balance before transferring
    if (balance < ethers.parseEther(amount)) {
      throw new Error(`🚨 Insufficient balance to transfer ${amount} tokens`);
    }

    // Transfer
    console.log(`🔹 Executing transfer...`);
    const tx = await targetContract.transfer(to, ethers.parseEther(amount));
    await tx.wait();

    console.log(`✅ Transferred ${amount} tokens to ${to} on ${network}`);
    return { success: true, txHash: tx.hash };
  }

  /**
   * method to check gelato tasks which are in pending state, and update its status in background
   */
  async checkGelatoTask(taskId: string) {
    const response = await fetch(
      `https://api.gelato.digital/tasks/status/${taskId}`,
    );
    const result = await response.json();
    console.log(result);

    if (
      result.task.taskState === 'ExecSuccess' &&
      result.task.transactionHash
    ) {
      console.log(
        `✅ Gelato Task ${taskId} executed! TX Hash: ${result.task.transactionHash}`,
      );

      // ✅ Update Database with Transaction Hash
      await this.transactionsService.updateTransactionByTaskId(taskId, {
        txHash: result.task.transactionHash,
        status: 'completed',
      });
    } else if (result.task.taskState === 'Cancelled') {
      console.log(`❌ Gelato Task ${taskId} failed!`);
      await this.transactionsService.updateTransactionByTaskId(taskId, {
        status: 'failed',
      });
    }
  }

  async schedulePeriodicCheck() {
    setInterval(async () => {
      console.log('🔍 Checking pending Gelato transactions...');
      const pendingTransactions =
        await this.transactionsService.getPendingTransactions();

      for (const tx of pendingTransactions) {
        await this.checkGelatoTask(tx.gelatoTaskId);
      }
    }, 10000); // Check every 10 seconds
  }
}
