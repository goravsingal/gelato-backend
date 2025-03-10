import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class BridgeTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user: string; // User's wallet address

  @Column()
  network: 'arbitrum' | 'optimism';

  @Column()
  type: 'burn' | 'mint';

  @Column()
  amount: string;

  @Column({ nullable: true })
  txHash: string;

  @Column({ nullable: true })
  txHashOriginator: string;

  @Column({ nullable: true })
  gelatoTaskId?: string;

  @Column({ default: 'pending' })
  status: 'pending' | 'completed' | 'failed' | 'processing';

  @CreateDateColumn()
  createdAt: Date;
}
