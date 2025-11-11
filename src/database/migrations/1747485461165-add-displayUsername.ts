import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDisplayUsername1747485461165 implements MigrationInterface {
  name = 'AddDisplayUsername1747485461165';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "user"
            ADD "displayUsername" character varying
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_25dca47b418c43ad4bdbe4fbb9" ON "user" ("displayUsername")
            WHERE "deletedAt" IS NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."IDX_25dca47b418c43ad4bdbe4fbb9"
        `);
    await queryRunner.query(`
            ALTER TABLE "user" DROP COLUMN "displayUsername"
        `);
  }
}
