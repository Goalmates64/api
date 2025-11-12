import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';

import { UsersService } from '../users/users.service';
import { ChatMessageDto } from './dto/chat-message.dto';

interface AuthenticatedSocket extends Socket {
  data: Socket['data'] & { userId?: number };
}

@WebSocketGateway({
  namespace: 'chat',
  cors: {
    origin: true,
    credentials: true,
  },
})
@Injectable()
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);
  private readonly userSockets = new Map<number, Set<AuthenticatedSocket>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });
      const userId = Number(payload?.sub ?? payload?.userId);
      if (!userId) {
        client.disconnect(true);
        return;
      }

      const user = await this.usersService.findById(userId);
      if (!user?.isChatEnabled) {
        client.emit('chat:disabled');
        client.disconnect(true);
        return;
      }

      client.data.userId = userId;
      const sockets = this.userSockets.get(userId) ?? new Set();
      sockets.add(client);
      this.userSockets.set(userId, sockets);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Impossible de valider le token';
      this.logger.warn(`Connexion WebSocket chat refusÃ©e: ${message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }

    const sockets = this.userSockets.get(userId);
    if (!sockets) {
      return;
    }

    sockets.delete(client);
    if (!sockets.size) {
      this.userSockets.delete(userId);
    }
  }

  emitMessageToUsers(userIds: number[], message: ChatMessageDto) {
    const unique = Array.from(new Set(userIds));
    unique.forEach((userId) =>
      this.emitToUser(userId, 'chat:message', message),
    );
  }

  emitMessageToAll(message: ChatMessageDto) {
    this.userSockets.forEach((sockets) => {
      sockets.forEach((socket) => socket.emit('chat:message', message));
    });
  }

  private emitToUser(userId: number, event: string, payload: unknown) {
    const sockets = this.userSockets.get(userId);
    if (!sockets?.size) {
      return;
    }
    sockets.forEach((socket) => socket.emit(event, payload));
  }

  private extractToken(client: Socket): string | null {
    const authHeader = client.handshake.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.split(' ')[1];
    }
    const tokenFromAuth = client.handshake.auth?.token;
    if (typeof tokenFromAuth === 'string' && tokenFromAuth.length > 0) {
      return tokenFromAuth;
    }
    const tokenFromQuery = client.handshake.query?.token;
    if (typeof tokenFromQuery === 'string' && tokenFromQuery.length > 0) {
      return tokenFromQuery;
    }
    return null;
  }
}
