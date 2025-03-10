import { MigrationInterface, QueryRunner } from "typeorm";

export class Originaltx1741602481891 implements MigrationInterface {
    name = 'Originaltx1741602481891'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bridge_transaction" ADD "txHashOriginator" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bridge_transaction" DROP COLUMN "txHashOriginator"`);
    }

}
