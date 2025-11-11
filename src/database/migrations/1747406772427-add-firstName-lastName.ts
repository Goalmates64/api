import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFirstNameLastName1747406772427 implements MigrationInterface {
  name = 'AddFirstNameLastName1747406772427';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "user"
            ADD "firstName" character varying
        `);
    await queryRunner.query(`
            ALTER TABLE "user"
            ADD "lastName" character varying
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "user" DROP COLUMN "lastName"
        `);
    await queryRunner.query(`
            ALTER TABLE "user" DROP COLUMN "firstName"
        `);
  }
}
