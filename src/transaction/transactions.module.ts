import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BridgeTransaction } from './bridge-transaction.entity';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [TypeOrmModule.forFeature([BridgeTransaction]), TransactionsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService], // Allow usage in other modules
})
export class TransactionsModule {}
