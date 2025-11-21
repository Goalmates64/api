import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { NotificationEmailQueue, NotificationEmailJobPayload } from './notification-email.queue';
import { Notification } from './notification.entity';
import { User } from '../users/user.entity';
import { MailService } from '../mail/mail.service';

@Injectable()
export class NotificationEmailWorker {
  private readonly logger = new Logger(NotificationEmailWorker.name);

  constructor(
    private readonly queue: NotificationEmailQueue,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly mailService: MailService,
  ) {
    this.queue.registerProcessor((job) => this.handleJob(job));
  }

  private async handleJob(job: NotificationEmailJobPayload): Promise<void> {
    if (!job.notificationIds.length) {
      return;
    }

    const notifications = await this.notificationRepo.find({
      where: { id: In(job.notificationIds) },
    });

    if (!notifications.length) {
      this.logger.warn(
        `Notification email job ignored because ${job.notificationIds.length} notifications were missing`,
      );
      return;
    }

    const receiverIds = Array.from(new Set(notifications.map((entry) => entry.receiverId)));
    const receivers = await this.userRepo.find({
      where: { id: In(receiverIds) },
      select: { id: true, email: true, username: true, firstName: true, isEmailVerified: true },
    });
    const receiverMap = new Map(receivers.map((receiver) => [receiver.id, receiver]));

    await Promise.allSettled(
      notifications.map(async (entry) => {
        const receiver = receiverMap.get(entry.receiverId);
        if (!receiver) {
          this.logger.warn(
            `Notification ${entry.id} skipped because receiver ${entry.receiverId} was missing`,
          );
          return;
        }

        if (!this.shouldSendEmail(receiver)) {
          this.logger.debug(
            `Notification ${entry.id} skipped because receiver ${receiver.id} opted out or is not verified`,
          );
          return;
        }

        await this.mailService.sendNotificationEmail({
          to: receiver.email,
          username: receiver.firstName ?? receiver.username,
          title: entry.title,
          body: entry.body,
        });
      }),
    );
  }

  private shouldSendEmail(receiver: Pick<User, 'isEmailVerified'>): boolean {
    return receiver.isEmailVerified;
  }
}
