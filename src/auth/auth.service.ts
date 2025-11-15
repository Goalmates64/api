import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';

import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/user.entity';
import { MailService } from '../mail/mail.service';
import { TwoFactorService } from './two-factor.service';

interface TimedToken {
  plain: string;
  hash: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  private static readonly VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24h
  private static readonly PASSWORD_RESET_TOKEN_TTL_MS = 1000 * 60 * 30; // 30min

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  async register(dto: CreateUserDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email deja utilise');
    }

    const user = await this.usersService.create(dto);
    await this.issueVerificationEmail(user);

    return {
      message: 'Compte cree. Verifie ta boite mail pour activer ton compte.',
      requiresEmailVerification: true as const,
    };
  }

  async resendVerification(email: string) {
    const successMessage =
      "Si un compte existe pour cet email, un nouveau lien vient d'etre envoye.";

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return { message: successMessage };
    }

    if (user.isEmailVerified) {
      return { message: 'Ce compte est deja verifie.' };
    }

    await this.issueVerificationEmail(user);
    return { message: successMessage };
  }

  async verifyEmail(token: string) {
    const hashed = this.hashToken(token);
    const user = await this.usersService.findByVerificationTokenHash(hashed);
    if (!user || !user.emailVerificationTokenExpiresAt) {
      throw new UnauthorizedException('Lien de verification invalide ou expire');
    }

    if (user.emailVerificationTokenExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Lien de verification invalide ou expire');
    }

    user.isEmailVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerificationTokenHash = null;
    user.emailVerificationTokenExpiresAt = null;
    await this.usersService.save(user);

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException({
        message: 'Merci de verifier ton email pour te connecter.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    if (user.isTwoFactorEnabled) {
      const sanitizedCode = dto.twoFactorCode?.replace(/\s+/g, '').trim();
      if (!sanitizedCode) {
        throw new UnauthorizedException({
          message: 'Code de validation requis.',
          code: 'TWO_FACTOR_REQUIRED',
        });
      }

      const codeIsValid = this.twoFactorService.isCodeValid(sanitizedCode, user.twoFactorSecret ?? '');
      if (!codeIsValid) {
        throw new UnauthorizedException({
          message: 'Code de validation invalide.',
          code: 'TWO_FACTOR_INVALID',
        });
      }
    }

    return this.buildAuthResponse(user);
  }

  async requestPasswordReset(email: string) {
    const successMessage =
      "Si un compte existe pour cet email, des instructions viennent d'etre envoyees.";

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return { message: successMessage };
    }

    const token = this.createToken(AuthService.PASSWORD_RESET_TOKEN_TTL_MS);
    user.passwordResetTokenHash = token.hash;
    user.passwordResetTokenExpiresAt = token.expiresAt;
    await this.usersService.save(user);

    await this.mailService.sendPasswordResetEmail({
      to: user.email,
      username: user.username,
      token: token.plain,
      expiresAt: token.expiresAt,
    });

    return { message: successMessage };
  }

  async resetPassword(token: string, newPassword: string) {
    const hashed = this.hashToken(token);
    const user = await this.usersService.findByPasswordResetTokenHash(hashed);
    if (!user || !user.passwordResetTokenExpiresAt) {
      throw new UnauthorizedException('Lien de reinitialisation invalide ou expire');
    }

    if (user.passwordResetTokenExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Lien de reinitialisation invalide ou expire');
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordResetTokenHash = null;
    user.passwordResetTokenExpiresAt = null;
    await this.usersService.save(user);

    return this.buildAuthResponse(user);
  }

  async initiateTwoFactorSetup(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    if (user.isTwoFactorEnabled) {
      throw new BadRequestException('La double authentification est deja active.');
    }

    const secret = this.twoFactorService.generateSecret();
    user.twoFactorSecret = secret;
    await this.usersService.save(user);

    const otpauthUrl = this.twoFactorService.buildOtpAuthUrl(user.email, secret);
    const qrCodeDataUrl = await this.twoFactorService.buildQrCodeDataUrl(otpauthUrl);

    return {
      secret,
      otpauthUrl,
      qrCodeDataUrl,
    };
  }

  async enableTwoFactor(userId: number, code: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    if (!user.twoFactorSecret) {
      throw new BadRequestException('Genere un code de configuration d\'abord.');
    }

    const sanitizedCode = code?.replace(/\s+/g, '').trim();
    if (!this.twoFactorService.isCodeValid(sanitizedCode, user.twoFactorSecret)) {
      throw new UnauthorizedException('Code 2FA invalide.');
    }

    user.isTwoFactorEnabled = true;
    user.twoFactorEnabledAt = new Date();
    await this.usersService.save(user);

    return this.usersService.toProfile(user);
  }

  async disableTwoFactor(userId: number, code: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    if (!user.isTwoFactorEnabled) {
      user.twoFactorSecret = null;
      user.twoFactorEnabledAt = null;
      await this.usersService.save(user);
      return this.usersService.toProfile(user);
    }

    const sanitizedCode = code?.replace(/\s+/g, '').trim();
    if (!this.twoFactorService.isCodeValid(sanitizedCode, user.twoFactorSecret ?? '')) {
      throw new UnauthorizedException('Code 2FA invalide.');
    }

    user.isTwoFactorEnabled = false;
    user.twoFactorSecret = null;
    user.twoFactorEnabledAt = null;
    await this.usersService.save(user);

    return this.usersService.toProfile(user);
  }

  async getProfile(userId: number) {
    const profile = await this.usersService.getProfile(userId);
    if (!profile) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    return profile;
  }

  private async issueVerificationEmail(user: User) {
    const token = this.createToken(AuthService.VERIFICATION_TOKEN_TTL_MS);
    user.emailVerificationTokenHash = token.hash;
    user.emailVerificationTokenExpiresAt = token.expiresAt;
    user.isEmailVerified = false;
    user.emailVerifiedAt = null;
    await this.usersService.save(user);

    await this.mailService.sendEmailVerification({
      to: user.email,
      username: user.username,
      token: token.plain,
      expiresAt: token.expiresAt,
    });
  }

  private createToken(ttlMs: number): TimedToken {
    const plain = randomBytes(32).toString('hex');
    return {
      plain,
      hash: this.hashToken(plain),
      expiresAt: new Date(Date.now() + ttlMs),
    };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildAuthResponse(user: User) {
    const payload = { sub: user.id, email: user.email };
    const access_token = this.jwtService.sign(payload);
    return {
      access_token,
      user: this.usersService.toProfile(user),
    };
  }
}
