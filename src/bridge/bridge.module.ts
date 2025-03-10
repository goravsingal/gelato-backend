import { Module } from '@nestjs/common';
import { BridgeController } from './bridge.controller';
import { Web3Service } from 'src/web3/web3.service';
import { ConfigModule } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { TransactionsModule } from 'src/transaction/transactions.module';
import { RedisMintWorker } from 'src/web3/redis-mint.worker';

@Module({
  imports: [ConfigModule, TransactionsModule],
  controllers: [BridgeController, AdminController], // Register the controller
  providers: [Web3Service, RedisMintWorker], // Register the service
  exports: [Web3Service], // Optional: If you need to use Web3Service in another module
})
export class BridgeModule {}
