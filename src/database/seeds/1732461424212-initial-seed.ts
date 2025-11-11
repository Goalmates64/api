import { Role } from '@/api/user/user.enum';
import { AccountEntity } from '@/auth/entities/account.entity';
import { UserEntity } from '@/auth/entities/user.entity';
import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';

export class InitialSeed1732461424212 implements Seeder {
  track = true;

  public async run(
    dataSource: DataSource,
    _: SeederFactoryManager,
  ): Promise<any> {
    await dataSource.transaction(async (transactionManager) => {
      const $userRepository = transactionManager.getRepository(UserEntity);
      const $accountRepository =
        transactionManager.getRepository(AccountEntity);

      const user = await $userRepository.save(
        $userRepository.create({
          username: 'admin',
          email: 'admin@admin.com',
          role: Role.Admin,
          isEmailVerified: true,
        }),
      );
      // For security reasons, admin password is not set here.
      // Use reset password feature to set password for this account.
      await $accountRepository.save(
        $accountRepository.create({
          accountId: user.id,
          userId: user.id,
          providerId: 'credential',
        }),
      );
    });
  }
}
