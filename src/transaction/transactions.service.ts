import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BridgeTransaction } from './bridge-transaction.entity';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(BridgeTransaction)
    private transactionRepository: Repository<BridgeTransaction>,
  ) {}

  async saveTransaction(data: Partial<BridgeTransaction>) {
    const transaction = this.transactionRepository.create(data);
    return await this.transactionRepository.save(transaction);
  }

  async getUserTransactions(user: string) {
    return await this.transactionRepository.find({
      where: { user },
      order: { createdAt: 'DESC' },
    });
  }

  async updateTransactionByTaskId(
    taskId: string,
    updateData: Partial<BridgeTransaction>,
  ) {
    return await this.transactionRepository.update(
      { gelatoTaskId: taskId },
      updateData,
    );
  }

  async updateTransactionByLastTx(
    txHashOriginator: string,
    updateData: Partial<BridgeTransaction>,
  ) {
    return await this.transactionRepository.update(
      { txHashOriginator: txHashOriginator },
      updateData,
    );
  }

  /**
   * Get all pending transactions that haven't been confirmed yet.
   */
  async getPendingTransactions(): Promise<BridgeTransaction[]> {
    return await this.transactionRepository.find({
      where: { status: 'processing' },
    });
  }

  /**
   * Get all transactions matching this Tx hash, or in originator tx
   */
  async getTransactionsByTxHash(tx: string): Promise<BridgeTransaction[]> {
    return await this.transactionRepository.find({
      where: [{ txHash: tx }, { txHashOriginator: tx }],
      order: { createdAt: 'DESC' },
    });
  }
}
