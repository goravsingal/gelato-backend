import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { Web3Service } from './web3.service';

@Injectable()
export class RedisMintWorker implements OnModuleInit {
  private readonly logger = new Logger(RedisMintWorker.name);
  private worker: Worker;

  constructor(private readonly web3Service: Web3Service) {
    this.logger.log('Setting up redis bullmq for gelatoMintJob');
    this.worker = new Worker(
      process.env.REDIS_QUEUE_NAME,
      async (job) => {
        this.logger.log(`Processing Mint Job: ${JSON.stringify(job.data)}`);

        const { user, amount, targetNetwork, txHashOriginator } = job.data;

        try {
          await this.web3Service.mintTokensUsingGelato(
            user,
            amount,
            targetNetwork,
            txHashOriginator,
          );
          this.logger.log(`Mint completed for ${user} on ${targetNetwork}`);
        } catch (error) {
          this.logger.error(`Minting failed:`, error);
          throw error;
        }
      },
      {
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: Number(process.env.REDIS_PORT) || 6379,
        },
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Mint job completed: ${job.id}`);
    });

    this.worker.on('failed', async (job, err) => {
      this.logger.error(`Mint job failed: ${job.id}`, err);

      // Automatically retry up to 3 times with exponential backoff
      if (job.attemptsMade < 3) {
        this.logger.log(
          `Retrying job ${job.id} (attempt ${job.attemptsMade + 1})`,
        );
        await job.retry();
      } else {
        this.logger.error(`Job ${job.id} permanently failed after 3 attempts`);
        this.logger.error(
          `logging failed job detailed`,
          JSON.stringify(job.data),
        );
      }
    });
  }

  async onModuleInit() {
    this.logger.log('Mint Worker initialized...');
  }
}
