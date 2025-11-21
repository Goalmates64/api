import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { Notification } from './notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { User } from '../users/user.entity';
import { NotificationsGateway } from './notifications.gateway';
import { MailModule } from '../mail/mail.module'; // <-- import du module
import { NotificationEmailQueue } from './notification-email.queue';
import { NotificationEmailWorker } from './notification-email.worker';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Notification, User]),
    MailModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationEmailQueue,
    NotificationEmailWorker,
  ],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
