import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Notification } from './notification.entity';
import { User } from '../users/user.entity';
import { NotificationsGateway } from './notifications.gateway';

export interface CreateNotificationPayload {
  senderId?: number | null;
  receiverId: number;
  title: string;
  body: string;
}

export interface NotificationSummary {
  id: number;
  senderId: number | null;
  receiverId: number;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
  sender: { id: number; username: string } | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async listForUser(userId: number): Promise<NotificationSummary[]> {
    const notifications = await this.notificationRepo.find({
      where: { receiverId: userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    const senderMap = await this.loadSenders(
      notifications.map((notification) => notification.senderId),
    );

    return notifications.map((notification) => {
      const senderSummary =
        notification.senderId !== null ? (senderMap.get(notification.senderId) ?? null) : null;

      return this.toSummary(notification, senderSummary);
    });
  }

  async unreadCount(userId: number): Promise<number> {
    return this.notificationRepo.count({
      where: { receiverId: userId, isRead: false },
    });
  }

  async setReadStatus(
    userId: number,
    notificationId: number,
    isRead: boolean,
  ): Promise<NotificationSummary> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, receiverId: userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification introuvable');
    }

    notification.isRead = isRead;
    const saved = await this.notificationRepo.save(notification);

    const sender = await this.loadSingleSender(saved.senderId);
    const summary = this.toSummary(saved, sender);
    this.notificationsGateway.emitUpdatedNotification(userId, summary);
    await this.emitUnreadCountsForUsers([userId]);
    return summary;
  }

  async createNotification(payload: CreateNotificationPayload): Promise<NotificationSummary> {
    const notification = this.notificationRepo.create({
      senderId: payload.senderId ?? null,
      receiverId: payload.receiverId,
      title: payload.title.trim(),
      body: payload.body.trim(),
      isRead: false,
    });

    const saved = await this.notificationRepo.save(notification);
    const sender = await this.loadSingleSender(saved.senderId);
    const summary = this.toSummary(saved, sender);
    this.notificationsGateway.emitNewNotification(summary.receiverId, summary);
    await this.emitUnreadCountsForUsers([summary.receiverId]);
    return summary;
  }

  async notifyMany(payloads: CreateNotificationPayload[]): Promise<void> {
    if (!payloads.length) {
      return;
    }

    const notifications = payloads.map((payload) =>
      this.notificationRepo.create({
        senderId: payload.senderId ?? null,
        receiverId: payload.receiverId,
        title: payload.title.trim(),
        body: payload.body.trim(),
        isRead: false,
      }),
    );

    const saved = await this.notificationRepo.save(notifications);

    const senderMap = await this.loadSenders(saved.map((entry) => entry.senderId));

    saved.forEach((entry) => {
      const senderSummary =
        entry.senderId !== null ? (senderMap.get(entry.senderId) ?? null) : null;
      const summary = this.toSummary(entry, senderSummary);
      this.notificationsGateway.emitNewNotification(summary.receiverId, summary);
    });

    await this.emitUnreadCountsForUsers(saved.map((entry) => entry.receiverId));
  }

  private async loadSingleSender(
    senderId: number | null,
  ): Promise<{ id: number; username: string } | null> {
    if (!senderId) {
      return null;
    }

    const sender = await this.userRepo.findOne({
      where: { id: senderId },
      select: { id: true, username: true },
    });

    return sender ? { id: sender.id, username: sender.username } : null;
  }

  private async loadSenders(senderIds: Array<number | null>) {
    const uniqueIds = Array.from(
      new Set(senderIds.filter((id): id is number => typeof id === 'number')),
    );

    if (!uniqueIds.length) {
      return new Map<number, { id: number; username: string }>();
    }

    const senders = await this.userRepo.find({
      where: { id: In(uniqueIds) },
      select: { id: true, username: true },
    });

    return new Map(senders.map((sender) => [sender.id, sender]));
  }

  private toSummary(
    notification: Notification,
    sender: { id: number; username: string } | null,
  ): NotificationSummary {
    return {
      id: notification.id,
      senderId: notification.senderId,
      receiverId: notification.receiverId,
      title: notification.title,
      body: notification.body,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
      sender,
    };
  }

  private async emitUnreadCountsForUsers(userIds: number[]) {
    const uniqueIds = Array.from(new Set(userIds));
    await Promise.all(
      uniqueIds.map(async (receiverId) => {
        const count = await this.unreadCount(receiverId);
        this.notificationsGateway.emitUnreadCount(receiverId, count);
      }),
    );
  }
}
