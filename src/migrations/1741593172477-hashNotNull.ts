import { MigrationInterface, QueryRunner } from "typeorm";

export class HashNotNull1741593172477 implements MigrationInterface {
    name = 'HashNotNull1741593172477'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bridge_transaction" ALTER COLUMN "txHash" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bridge_transaction" ALTER COLUMN "txHash" SET NOT NULL`);
    }

}
