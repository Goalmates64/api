import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import * as requestWithUser from '../common/types/request-with-user';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { TwoFactorCodeDto } from './dto/two-factor-code.dto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: CreateUserDto) {
    this.logger.log(`Attempted registration for ${dto.email}`);
    const result = await this.authService.register(dto);
    this.logger.log(`Verification email sent to ${dto.email}`);
    return result;
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    this.logger.log(`Attempted login for ${dto.email}`);
    const result = await this.authService.login(dto);
    this.logger.log(`Successful login for ${dto.email}`);
    return result;
  }

  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const result = await this.authService.verifyEmail(dto.token);
    this.logger.log(`Email verified for userId=${result.user.id}`);
    return result;
  }

  @Post('resend-verification')
  async resendVerification(@Body() dto: ResendVerificationDto) {
    this.logger.log(`Resend verification requested for ${dto.email}`);
    return this.authService.resendVerification(dto.email);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    this.logger.log(`Password reset requested for ${dto.email}`);
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    this.logger.log('Password reset executed through token');
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: requestWithUser.RequestWithUser) {
    const userId = this.extractUserId(req);
    this.logger.log(`Fetched profile for userId=${userId}`);
    return this.authService.getProfile(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  initiateTwoFactor(@Req() req: requestWithUser.RequestWithUser) {
    const userId = this.extractUserId(req);
    this.logger.log(`2FA setup requested for userId=${userId}`);
    return this.authService.initiateTwoFactorSetup(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  enableTwoFactor(@Req() req: requestWithUser.RequestWithUser, @Body() dto: TwoFactorCodeDto) {
    const userId = this.extractUserId(req);
    this.logger.log(`2FA enable requested for userId=${userId}`);
    return this.authService.enableTwoFactor(userId, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  disableTwoFactor(@Req() req: requestWithUser.RequestWithUser, @Body() dto: TwoFactorCodeDto) {
    const userId = this.extractUserId(req);
    this.logger.log(`2FA disable requested for userId=${userId}`);
    return this.authService.disableTwoFactor(userId, dto.code);
  }

  private extractUserId(req: requestWithUser.RequestWithUser): number {
    const userId = req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Utilisateur non authentifie');
    }
    return Number(userId);
  }
}
