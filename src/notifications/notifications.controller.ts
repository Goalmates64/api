import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { UpdateNotificationReadDto } from './dto/update-notification-read.dto';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  listAll(@CurrentUser() userId: number) {
    return this.notificationsService.listForUser(userId);
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() userId: number) {
    const count = await this.notificationsService.unreadCount(userId);
    return { count };
  }

  @Patch(':id/read')
  markAsRead(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNotificationReadDto,
  ) {
    return this.notificationsService.setReadStatus(userId, id, dto.isRead);
  }
}
