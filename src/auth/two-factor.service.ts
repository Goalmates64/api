import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

@Injectable()
export class TwoFactorService {
  private readonly issuer: string;

  constructor(private readonly configService: ConfigService) {
    this.issuer = this.configService.get<string>('TWO_FACTOR_ISSUER') ?? 'GoalMates';
  }

  generateSecret(): string {
    return authenticator.generateSecret();
  }

  buildOtpAuthUrl(email: string, secret: string): string {
    const label = email?.trim() || 'goalMate';
    return authenticator.keyuri(label, this.issuer, secret);
  }

  async buildQrCodeDataUrl(otpauthUrl: string): Promise<string> {
    return QRCode.toDataURL(otpauthUrl, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
  }

  isCodeValid(code: string, secret: string): boolean {
    if (!secret || !code) {
      return false;
    }

    const sanitized = code.replace(/\s+/g, '').trim();
    if (!/^\d{6}$/.test(sanitized)) {
      return false;
    }

    return authenticator.check(sanitized, secret);
  }
}
