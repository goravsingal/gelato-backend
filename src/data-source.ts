import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { BridgeTransaction } from './transaction/bridge-transaction.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'password',
  database: process.env.DB_NAME || 'bridge_db',
  entities: [BridgeTransaction],
  migrations: ['src/migrations/*.ts'],
  synchronize: false, // Ensure migrations are used instead of auto-sync
});
