import { UserEntity } from '@/auth/entities/user.entity';
import { MailService } from '@/shared/mail/mail.service';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EmailVerificationJob,
  ResetPasswordJob,
  SignInMagicLinkJob,
} from './email.type';

@Injectable()
export class EmailQueueService {
  private logger = new Logger(this.constructor.name);

  constructor(
    private readonly mailService: MailService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async verifyEmail(data: EmailVerificationJob['data']): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: data.userId },
    });
    if (!user) {
      this.logger.error(`User id = ${data.userId} does not exist.`);
    }
    await this.mailService.sendEmailVerificationMail({
      email: user.email,
      url: data.url,
    });
  }

  async sendMagicLink(data: SignInMagicLinkJob['data']): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { email: data.email },
    });
    if (!user) {
      return;
    }
    await this.mailService.sendAuthMagicLinkMail({
      email: user.email,
      url: data.url,
    });
  }

  async resetPassword(data: ResetPasswordJob['data']): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: data.userId },
    });
    if (!user) {
      return;
    }
    await this.mailService.sendResetPasswordMail({
      email: user.email,
      url: data.url,
    });
  }
}
