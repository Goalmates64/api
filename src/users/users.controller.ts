import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';

type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
};

@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async findCurrent(@Req() req: any) {
    const userId = this.extractUserId(req);
    this.logger.log(`Fetching current profile for userId=${userId}`);
    const profile = await this.usersService.getProfile(userId);
    if (!profile) {
      this.logger.error(`Profile not found for userId=${userId}`);
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    return profile;
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateCurrent(@Req() req: any, @Body() dto: UpdateProfileDto) {
    const userId = this.extractUserId(req);
    this.logger.log(`Updating profile for userId=${userId}`);
    return this.usersService.updateProfile(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  uploadAvatar(@Req() req: any, @UploadedFile() file: UploadedFile) {
    const userId = this.extractUserId(req);
    this.logger.log(`Uploading avatar for userId=${userId}`);
    return this.usersService.updateAvatar(userId, file);
  }

  @UseGuards(JwtAuthGuard)
  @Get('search')
  search(@Query('query') query = '') {
    this.logger.log(`Searching users with query="${query}"`);
    return this.usersService.searchByUsername(query);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const requesterId = this.extractUserId(req);
    if (requesterId !== id) {
      this.logger.warn(`User ${requesterId} attempted to access profile ${id}`);
      throw new ForbiddenException('Accès refusé');
    }

    this.logger.log(`Fetching profile for userId=${id}`);
    const profile = await this.usersService.getProfile(id);
    if (!profile) {
      this.logger.error(`Profile not found for userId=${id}`);
      throw new NotFoundException('Utilisateur introuvable');
    }

    return profile;
  }

  private extractUserId(req: any): number {
    const userId = req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Utilisateur non authentifie');
    }
    return Number(userId);
  }
}
