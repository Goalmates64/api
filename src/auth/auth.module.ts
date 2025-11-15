import { Logger, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './jwt.strategy';
import { MailModule } from '../mail/mail.module';
import { TwoFactorService } from './two-factor.service';

const MIN_JWT_EXPIRATION_SECONDS = 60;
type JwtExpiryString = `${number}${'s' | 'm' | 'h' | 'd'}`;

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    PassportModule,
    MailModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: resolveJwtExpiration(config),
        },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, TwoFactorService],
  controllers: [AuthController],
})
export class AuthModule {}

function resolveJwtExpiration(config: ConfigService): number | JwtExpiryString {
  const raw = config.get<string>('JWT_EXPIRES_IN');
  if (!raw) {
    return '1h';
  }

  const numeric = Number(raw);
  if (!Number.isNaN(numeric)) {
    if (numeric < MIN_JWT_EXPIRATION_SECONDS) {
      Logger.warn(
        `JWT_EXPIRES_IN trop faible (${numeric}s). Valeur par défaut 3600s utilisée.`,
        AuthModule.name,
      );
      return 3600;
    }
    return numeric;
  }

  if (/^\d+[smhd]$/i.test(raw)) {
    return raw.toLowerCase() as JwtExpiryString;
  }

  Logger.warn(`JWT_EXPIRES_IN invalide (${raw}). Valeur par défaut 1h utilisée.`, AuthModule.name);
  return '1h';
}
