import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateBridgeTransactions1741592264867 implements MigrationInterface {
    name = 'CreateBridgeTransactions1741592264867'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "bridge_transaction" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user" character varying NOT NULL, "network" character varying NOT NULL, "type" character varying NOT NULL, "amount" character varying NOT NULL, "txHash" character varying NOT NULL, "gelatoTaskId" character varying, "status" character varying NOT NULL DEFAULT 'pending', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a63f1ae91a5ebb1f10c94721db8" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "bridge_transaction"`);
    }

}
