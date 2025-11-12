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

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: CreateUserDto) {
    this.logger.log(`Attempted registration for ${dto.email}`);
    const result = await this.authService.register(dto);
    this.logger.log(`Created account for ${dto.email} (userId=${result.user.id})`);
    return result;
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    this.logger.log(`Attempted login for ${dto.email}`);
    const result = await this.authService.login(dto);
    this.logger.log(`Successful login for ${dto.email}`);
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: any) {
    const userId = req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Utilisateur non authentifie');
    }
    this.logger.log(`Fetched profile for userId=${userId}`);
    return this.authService.getProfile(Number(userId));
  }
}
