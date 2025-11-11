import { MailerModule } from '@nestjs-modules/mailer';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserEntity } from '@/auth/entities/user.entity';
import useMailFactory from '../../config/mail/mail.factory';
import { MailService } from './mail.service';

@Global()
@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: useMailFactory,
    }),
    TypeOrmModule.forFeature([UserEntity]),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
