import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasskeyTable1748170170238 implements MigrationInterface {
  name = 'AddPasskeyTable1748170170238';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "passkey" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "deletedAt" TIMESTAMP,
                "name" character varying,
                "userId" uuid NOT NULL,
                "publicKey" character varying NOT NULL,
                "credentialID" character varying NOT NULL,
                "counter" integer NOT NULL,
                "deviceType" character varying NOT NULL,
                "backedUp" boolean NOT NULL,
                "transports" character varying NOT NULL,
                CONSTRAINT "PK_783e2060d8025abd6a6ca45d2c7" PRIMARY KEY ("id")
            )
        `);

    await queryRunner.query(`
            ALTER TABLE "passkey"
            ADD CONSTRAINT "FK_c36f303905314ea9ead857b6268" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "passkey" DROP CONSTRAINT "FK_c36f303905314ea9ead857b6268"
        `);
    await queryRunner.query(`
            DROP TABLE "passkey"
        `);
  }
}
