import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ethers } from 'ethers';
import { ConfigService } from '@nestjs/config';
import { GelatoRelay, SponsoredCallRequest } from '@gelatonetwork/relay-sdk';
import { TransactionsService } from 'src/transaction/transactions.service';
import { Queue } from 'bullmq';

@Injectable()
export class Web3Service implements OnModuleInit {
  private readonly logger = new Logger(Web3Service.name);
  private arbitrumProvider: ethers.JsonRpcProvider;
  private optimismProvider: ethers.JsonRpcProvider;
  private walletArbitrum: ethers.Wallet;
  private walletOptimism: ethers.Wallet;
  private arbitrumContract: ethers.Contract;
  private optimismContract: ethers.Contract;
  private relay: GelatoRelay;
  private contractAbi: string[];
  private mintQueue: Queue;

  constructor(
    private configService: ConfigService,
    private readonly transactionsService: TransactionsService,
  ) {
    this.logger.log('Initializing web3 service');
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

    // Gelato Relay
    this.relay = new GelatoRelay();

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
      'function transfer(address to, uint256 amount) external returns (bool)',
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

    // defining my redis bullmq queue
    this.mintQueue = new Queue(process.env.REDIS_QUEUE_NAME, {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
      },
    });

    // periodically check for gelato task status
    this.schedulePeriodicCheckForGelatoTransactions();
  }

  async onModuleInit() {
    this.logger.log('Listening to burn events on Arbitrum & Optimism...');
    await this.listenToBurnEvents();
  }

  async burnTokens(
    user: string,
    amount: string,
    network: 'arbitrum' | 'optimism',
    signature: string,
  ) {
    this.logger.log(`Burning ${amount} tokens for ${user} on ${network}`);

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
    this.logger.log('Sending burn transaction...');
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

    this.logger.log(`Burn successful on ${network}. TX: ${tx.hash}`);

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
    this.logger.log(`🚀 Minting to ${user} on ${targetNetwork} via Gelato`);

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

    this.logger.log('🔹 Encoded Mint Transaction Data:', mintTxData);

    // ✅ **Sign the transaction before sending to Gelato**
    const tx = {
      to: contractAddress,
      data: mintTxData,
      gasLimit: ethers.toBigInt('500000'), // Adjust gas limit if needed
    };

    const signedTx = await signer.signTransaction(tx);
    // this.logger.log('🔹 Signed Mint Transaction:', signedTx);

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

    this.logger.log(`✅ Mint request sent via Gelato. Task ID: ${taskId}`);
    return { success: true, taskId };
  }

  /**
   * 📡 Event Listener for Burn Events
   * - Detects burns and triggers minting on the opposite network
   */
  async listenToBurnEvents() {
    this.logger.log('🚀 Listening for burn events on Arbitrum & Optimism...');

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
          this.logger.log(`🔍 No new blocks on ${network}, skipping poll.`);
          return currentBlock;
        }

        // this.logger.log(
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
            this.logger.log(`Already processed tx: ${log.transactionHash}`);
            continue;
          }

          const parsedLog = contract.interface.parseLog(log);

          // this.logger.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
          // this.logger.log('details of event');
          // this.logger.log('log', log);
          // this.logger.log('log.transactionHash', log.transactionHash);
          // this.logger.log('parsedLog', parsedLog);
          // this.logger.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
          const { user, amount } = parsedLog.args;

          this.logger.log(
            `Burn event detected on ${network}: ${ethers.formatEther(amount)} tokens from ${user}`,
          );

          // save its future transaction entry, so that i can show its detail on client side
          this.logger.log(
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

          this.logger.log(`Event published to Redis`);

          processedTxs.add(log.transactionHash);
        }

        return currentBlock;
      } catch (error) {
        this.logger.error(`Error fetching logs for ${network}:`, error);
        return lastCheckedBlock;
      }
    };

    setInterval(async () => {
      this.logger.log('🔄 Polling for new burn events...');
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

    this.logger.log('✅ Started polling for burn events (no eth_newFilter)');
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
      this.logger.error('Error fetching user balance:', error);
      throw new Error('Failed to fetch user balance.');
    }
  }

  //////////// Admin methods ///////////////
  // **Self Mint Tokens (Bridge Operator)**
  async selfMintTokens(amount: bigint, network: 'arbitrum' | 'optimism') {
    this.logger.log(
      `🚀 Minting ${amount} tokens to Bridge Operator on ${network}`,
    );

    const targetContract =
      network === 'arbitrum' ? this.arbitrumContract : this.optimismContract;
    const operatorWallet =
      network === 'arbitrum'
        ? await this.walletArbitrum.getAddress()
        : await this.walletOptimism.getAddress();

    const tx = await targetContract.mint(
      operatorWallet,
      ethers.parseEther(amount.toString()),
    );
    await tx.wait();

    this.logger.log(`Minted ${amount} tokens to Bridge Operator on ${network}`);
    return { success: true, txHash: tx.hash };
  }

  // Get Bridge Operator Self-Balance
  async getSelfBalance() {
    const walletArbitrumAddress = await this.walletArbitrum.getAddress();
    const walletOptimismAddress = await this.walletOptimism.getAddress();

    this.logger.log(
      '🔍 Checking self balance for wallet:',
      walletArbitrumAddress,
    );

    try {
      // Fetch balances in parallel
      const [balanceArbitrum, balanceOptimism] = await Promise.all([
        this.arbitrumContract.balanceOf(walletArbitrumAddress),
        this.optimismContract.balanceOf(walletOptimismAddress),
      ]);

      this.logger.log('balanceArbitrum', ethers.formatEther(balanceArbitrum));
      this.logger.log('balanceOptimism', ethers.formatEther(balanceOptimism));

      return {
        walletArbitrumAddress: walletArbitrumAddress,
        walletOptimismAddress: walletOptimismAddress,
        arbitrumBalance: ethers.formatEther(balanceArbitrum),
        optimismBalance: ethers.formatEther(balanceOptimism),
      };
    } catch (error) {
      this.logger.error('Error fetching balances:', error);
      throw new Error('Failed to fetch balances');
    }
  }

  // Mint Tokens to User from Bridge Operator (Optional)
  async mintTokensToUser(
    to: string,
    amount: string,
    network: 'arbitrum' | 'optimism',
  ) {
    this.logger.log(
      `🚀 Sending ${amount} tokens from Bridge Operator to ${to} on ${network}`,
    );

    const targetContract =
      network === 'arbitrum' ? this.arbitrumContract : this.optimismContract;
    const bridgeOperator =
      network === 'arbitrum'
        ? await this.walletArbitrum.getAddress()
        : await this.walletOptimism.getAddress();

    this.logger.log('🔍 Checking Bridge Operator balance...');
    const balance = await targetContract.balanceOf(bridgeOperator);
    this.logger.log(
      `💰 Current Balance: ${ethers.formatEther(balance)} tokens`,
    );

    // ❌ Ensure enough balance before transferring
    if (balance < ethers.parseEther(amount)) {
      throw new Error(`🚨 Insufficient balance to transfer ${amount} tokens`);
    }

    // Transfer
    this.logger.log(`🔹 Executing transfer...`);
    const tx = await targetContract.transfer(to, ethers.parseEther(amount));
    await tx.wait();

    this.logger.log(`✅ Transferred ${amount} tokens to ${to} on ${network}`);
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
    this.logger.log(result);

    if (
      result.task.taskState === 'ExecSuccess' &&
      result.task.transactionHash
    ) {
      this.logger.log(
        `✅ Gelato Task ${taskId} executed! TX Hash: ${result.task.transactionHash}`,
      );

      // ✅ Update Database with Transaction Hash
      await this.transactionsService.updateTransactionByTaskId(taskId, {
        txHash: result.task.transactionHash,
        status: 'completed',
      });
    } else if (result.task.taskState === 'Cancelled') {
      this.logger.log(`❌ Gelato Task ${taskId} failed!`);
      await this.transactionsService.updateTransactionByTaskId(taskId, {
        status: 'failed',
      });
    }
  }

  /**
   * Check for Gelato transactions status
   */
  async schedulePeriodicCheckForGelatoTransactions() {
    setInterval(async () => {
      this.logger.log('🔍 Checking pending Gelato transactions...');
      const pendingTransactions =
        await this.transactionsService.getPendingTransactions();

      for (const tx of pendingTransactions) {
        await this.checkGelatoTask(tx.gelatoTaskId);
      }
    }, 10000); // Check every 10 seconds
  }
}
