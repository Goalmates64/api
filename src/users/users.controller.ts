import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async findCurrent(@Req() req: any) {
    const userId = this.extractUserId(req);
    const profile = await this.usersService.getProfile(userId);
    if (!profile) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    return profile;
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateCurrent(@Req() req: any, @Body() dto: UpdateProfileDto) {
    const userId = this.extractUserId(req);
    return this.usersService.updateProfile(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('search')
  search(@Query('query') query = '') {
    return this.usersService.searchByUsername(query);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const requesterId = this.extractUserId(req);
    if (requesterId !== id) {
      throw new ForbiddenException('Accès refusé');
    }

    const profile = await this.usersService.getProfile(id);
    if (!profile) {
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
