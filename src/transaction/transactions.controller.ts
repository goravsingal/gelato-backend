import { Controller, Get, Param } from '@nestjs/common';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get(':user')
  async getUserTransactions(@Param('user') user: string) {
    return this.transactionsService.getUserTransactions(user);
  }

  @Get('history/:tx')
  async getRelatedTransactions(@Param('tx') tx: string) {
    return this.transactionsService.getTransactionsByTxHash(tx);
  }
}
