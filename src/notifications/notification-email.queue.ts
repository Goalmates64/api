import { Injectable, Logger } from '@nestjs/common';

export interface NotificationEmailJobPayload {
  notificationIds: number[];
}

type QueueProcessor = (job: NotificationEmailJobPayload) => Promise<void>;

@Injectable()
export class NotificationEmailQueue {
  private readonly logger = new Logger(NotificationEmailQueue.name);
  private readonly jobs: NotificationEmailJobPayload[] = [];
  private processor: QueueProcessor | null = null;
  private draining = false;
  private pendingKick: Promise<void> | null = null;

  enqueue(notificationIds: number[]): void {
    if (!notificationIds.length) {
      return;
    }

    this.jobs.push({ notificationIds });
    this.logger.log(
      `Notification email job enqueued (count=${notificationIds.length}, depth=${this.jobs.length})`,
    );
    this.requestDrain();
  }

  registerProcessor(processor: QueueProcessor): void {
    if (this.processor) {
      throw new Error('Notification email queue already has a processor.');
    }

    this.processor = processor;
    this.logger.log('Notification email worker registered.');
    this.requestDrain();
  }

  private requestDrain(): void {
    if (this.pendingKick) {
      return;
    }

    this.pendingKick = Promise.resolve().then(async () => {
      this.pendingKick = null;
      await this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.draining || !this.processor) {
      return;
    }

    this.draining = true;

    while (this.jobs.length && this.processor) {
      const job = this.jobs.shift();
      if (!job) {
        break;
      }
      const startedAt = Date.now();
      this.logger.debug(
        `Starting notification email job (count=${job.notificationIds.length}, remaining=${this.jobs.length})`,
      );
      try {
        await this.processor(job);
        const duration = Date.now() - startedAt;
        this.logger.log(
          `Notification email job completed in ${duration}ms (remainingDepth=${this.jobs.length})`,
        );
      } catch (error) {
        const reason =
          error instanceof Error ? `${error.name}: ${error.message}` : JSON.stringify(error);
        this.logger.error(`Notification email job failed: ${reason}`);
      }
    }

    this.draining = false;

    if (this.jobs.length) {
      this.requestDrain();
    }
  }
}
