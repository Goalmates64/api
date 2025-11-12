import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('rooms')
  listRooms(@Req() req: any) {
    const userId = this.extractUserId(req);
    return this.chatService.listRooms(userId);
  }

  @Get('rooms/:roomId/messages')
  getMessages(
    @Req() req: any,
    @Param('roomId', ParseIntPipe) roomId: number,
    @Query('beforeId') beforeId?: string,
  ) {
    const userId = this.extractUserId(req);
    const rawCursor =
      typeof beforeId === 'string' && beforeId.length > 0
        ? Number(beforeId)
        : undefined;
    const cursor =
      rawCursor !== undefined && Number.isFinite(rawCursor)
        ? rawCursor
        : undefined;
    return this.chatService.getMessages(userId, roomId, cursor);
  }

  @Post('rooms/:roomId/messages')
  sendMessage(
    @Req() req: any,
    @Param('roomId', ParseIntPipe) roomId: number,
    @Body() dto: SendMessageDto,
  ) {
    const userId = this.extractUserId(req);
    return this.chatService.sendMessage(userId, roomId, dto);
  }

  private extractUserId(req: any): number {
    const userId = req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Utilisateur non authentifiÃ©');
    }
    return Number(userId);
  }
}
