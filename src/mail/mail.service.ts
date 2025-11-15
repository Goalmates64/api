import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';

import { buildEmailVerificationTemplate, buildNotificationTemplate, buildPasswordResetTemplate } from './templates';

type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

type MailTransport = {
  send(message: MailMessage & { from: string }): Promise<void>;
};

interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  user?: string | null;
  pass?: string | null;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly fromEmail: string;
  private readonly frontendBaseUrl: string;
  private readonly transport: MailTransport | null;

  constructor(private readonly configService: ConfigService) {
    this.fromEmail =
      this.configService.get<string>('MAIL_FROM') ?? 'GoalMates <noreply@goalmates.local>';
    this.frontendBaseUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:4200';
    const provider = (this.configService.get<string>('MAIL_PROVIDER') ?? 'smtp').toLowerCase();
    const hasResendKey = Boolean(this.configService.get<string>('RESEND_API_KEY'));
    this.logger.log(
      `Bootstrapping mail transport (provider=${provider}, from=${this.fromEmail}, frontendBase=${this.frontendBaseUrl}, hasResendKey=${hasResendKey})`,
    );
    this.transport = this.initializeTransport(provider);
    if (!this.transport) {
      this.logger.warn(
        'Mail transport inactive. Emails will be ignored until configuration is fixed.',
      );
    }
  }

  async sendEmailVerification(options: {
    to: string;
    username: string;
    token: string;
    expiresAt: Date;
  }): Promise<void> {
    const verifyUrl = this.buildFrontendUrl('auth/verify-email', { token: options.token });
    const template = buildEmailVerificationTemplate({
      username: options.username,
      verificationUrl: verifyUrl,
      expiresAt: options.expiresAt,
    });

    await this.dispatch({
      to: options.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }


  async sendPasswordResetEmail(options: {
    to: string;
    username: string;
    token: string;
    expiresAt: Date;
  }): Promise<void> {
    const resetUrl = this.buildFrontendUrl('auth/reset-password', { token: options.token });
    const template = buildPasswordResetTemplate({
      username: options.username,
      resetUrl,
      expiresAt: options.expiresAt,
    });

    await this.dispatch({
      to: options.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  async sendNotificationEmail(options: {
    to: string;
    username: string;
    title: string;
    body: string;
    actionPath?: string | null;
  }): Promise<void> {
    const actionUrl = options.actionPath
      ? this.buildFrontendUrl(options.actionPath)
      : this.buildFrontendUrl('notifications');

    const template = buildNotificationTemplate({
      username: options.username,
      title: options.title,
      body: options.body,
      actionUrl,
    });

    await this.dispatch({
      to: options.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  private initializeTransport(provider: string): MailTransport | null {
    if (['none', 'disabled', 'off'].includes(provider)) {
      this.logger.warn('MAIL_PROVIDER est desactive. Aucun email ne sera envoye.');
      return null;
    }

    if (provider === 'resend') {
      const apiKey = this.configService.get<string>('RESEND_API_KEY');
      if (!apiKey) {
        this.logger.error("RESEND_API_KEY est manquant. Impossible d'envoyer les emails.");
        return null;
      }
      this.logger.log('Resend transport configure.');
      return new ResendTransport(apiKey, this.logger);
    }

    const smtpOptions: SmtpOptions = {
      host: this.configService.get<string>('SMTP_HOST') ?? 'localhost',
      port: Number(this.configService.get<string>('SMTP_PORT') ?? '1025'),
      secure: this.resolveBoolean(this.configService.get('SMTP_SECURE'), false),
      user: this.configService.get<string>('SMTP_USER'),
      pass: this.configService.get<string>('SMTP_PASSWORD'),
    };

    this.logger.log(
      `SMTP transport configured (host=${smtpOptions.host}, port=${smtpOptions.port}, secure=${smtpOptions.secure}, auth=${smtpOptions.user ? 'enabled' : 'disabled'})`,
    );
    return new SmtpTransport(smtpOptions, this.logger);
  }

  private async dispatch(message: MailMessage): Promise<void> {
    if (!this.transport) {
      this.logger.warn(`Email ignore (transport inactif) -> ${message.to}`);
      return;
    }

    try {
      await this.transport.send({ ...message, from: this.fromEmail });
      this.logger.debug(`Email envoye a ${message.to}`);
    } catch (error: unknown) {
      const reason =
        error instanceof Error ? `${error.name}: ${error.message}` : JSON.stringify(error);
      this.logger.error(`Echec de l'envoi d'email a ${message.to}: ${reason}`);
    }
  }

  private buildFrontendUrl(path: string, query?: Record<string, string>): string {
    const sanitizedPath = path.replace(/^\//, '');
    const base = this.frontendBaseUrl.endsWith('/')
      ? this.frontendBaseUrl
      : `${this.frontendBaseUrl}/`;

    try {
      const url = new URL(sanitizedPath, base);
      if (query) {
        Object.entries(query).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, value);
          }
        });
      }
      return url.toString();
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'URL invalide';
      this.logger.warn(
        `URL front mal formee (${path}). Utilisation d'une concatenation simple. Detail: ${reason}`,
      );
      const queryString = query ? `?${new URLSearchParams(query).toString()}` : '';
      return `${base}${sanitizedPath}${queryString}`;
    }
  }

  private resolveBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value > 0;
    }
    if (typeof value === 'string') {
      return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
    }
    return fallback;
  }
}

class SmtpTransport implements MailTransport {
  private readonly transporter: nodemailer.Transporter;

  constructor(
    options: SmtpOptions,
    private readonly logger: Logger,
  ) {
    try {
      this.transporter = nodemailer.createTransport({
        host: options.host,
        port: options.port,
        secure: options.secure,
        auth: options.user
          ? {
              user: options.user,
              pass: options.pass ?? undefined,
            }
          : undefined,
      });
    } catch (error: unknown) {
      const reason =
        error instanceof Error ? `${error.name}: ${error.message}` : JSON.stringify(error);
      this.logger.error(`Impossible de configurer le transport SMTP: ${reason}`);
      throw error;
    }
  }

  async send(message: MailMessage & { from: string }): Promise<void> {
    await this.transporter.sendMail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo,
    });
  }
}

class ResendTransport implements MailTransport {
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly logger: Logger,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(message: MailMessage & { from: string }): Promise<void> {
    await this.client.emails.send({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    this.logger.debug(`Resend a accepte l'email vers ${message.to}`);
  }
}
