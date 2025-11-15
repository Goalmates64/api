import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';

import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/user.entity';
import { MailService } from '../mail/mail.service';

interface VerificationToken {
  plain: string;
  hash: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  private static readonly VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24h

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: CreateUserDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email deja utilise');
    }

    const user = await this.usersService.create(dto);
    await this.issueVerificationEmail(user);

    return {
      message: 'Compte créé. Vérifie ta boîte mail pour activer ton compte.',
      requiresEmailVerification: true as const,
    };
  }

  async resendVerification(email: string) {
    const successMessage =
      "Si un compte existe pour cet email, un nouveau lien vient d'être envoyé.";

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return { message: successMessage };
    }

    if (user.isEmailVerified) {
      return { message: 'Ce compte est déjà vérifié.' };
    }

    await this.issueVerificationEmail(user);
    return { message: successMessage };
  }

  async verifyEmail(token: string) {
    const hashed = this.hashToken(token);
    const user = await this.usersService.findByVerificationTokenHash(hashed);
    if (!user || !user.emailVerificationTokenExpiresAt) {
      throw new UnauthorizedException('Lien de vérification invalide ou expiré');
    }

    if (user.emailVerificationTokenExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Lien de vérification invalide ou expiré');
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
        message: 'Merci de vérifier ton email pour te connecter.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    return this.buildAuthResponse(user);
  }

  async getProfile(userId: number) {
    const profile = await this.usersService.getProfile(userId);
    if (!profile) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    return profile;
  }

  private async issueVerificationEmail(user: User) {
    const token = this.createVerificationToken();
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

  private createVerificationToken(): VerificationToken {
    const plain = randomBytes(32).toString('hex');
    return {
      plain,
      hash: this.hashToken(plain),
      expiresAt: new Date(Date.now() + AuthService.VERIFICATION_TOKEN_TTL_MS),
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
