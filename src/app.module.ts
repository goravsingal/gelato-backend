import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BridgeModule } from './bridge/bridge.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BridgeTransaction } from './transaction/bridge-transaction.entity';
import { TransactionsModule } from './transaction/transactions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USER'),
        password: configService.get<string>('DB_PASS'),
        database: configService.get<string>('DB_NAME'),
        entities: [BridgeTransaction],
        migrations: [__dirname + '/../migrations/*.{ts,js}'],
        synchronize: false,
        logging: false,
        migrationsRun: true,
      }),
    }),
    TransactionsModule,
    BridgeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
