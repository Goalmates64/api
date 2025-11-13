import { Injectable, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { NotificationSummary } from './notifications.service';

interface AuthenticatedSocket extends Socket {
  data: Record<string, unknown> & { userId?: number };
}

type JwtPayload = {
  sub?: number | string;
  userId?: number | string;
};

@WebSocketGateway({
  namespace: 'notifications',
  cors: {
    origin: true,
    credentials: true,
  },
})
@Injectable()
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly userSockets = new Map<number, Set<AuthenticatedSocket>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  handleConnection(client: AuthenticatedSocket) {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });
      const parsedId = Number(payload?.sub ?? payload?.userId);
      if (!Number.isFinite(parsedId)) {
        client.disconnect(true);
        return;
      }
      const userId = parsedId;

      client.data.userId = userId;
      const sockets = this.userSockets.get(userId) ?? new Set();
      sockets.add(client);
      this.userSockets.set(userId, sockets);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erreur de validation JWT';
      this.logger.warn('Connexion WS refusée: ' + message);
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
    if (sockets.size === 0) {
      this.userSockets.delete(userId);
    }
  }

  emitNewNotification(userId: number, notification: NotificationSummary) {
    this.emitToUser(userId, 'notification:new', notification);
  }

  emitUpdatedNotification(userId: number, notification: NotificationSummary) {
    this.emitToUser(userId, 'notification:update', notification);
  }

  emitUnreadCount(userId: number, count: number) {
    this.emitToUser(userId, 'notification:count', { count });
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
    const tokenFromAuth = this.toTokenValue(client.handshake.auth?.token);
    if (tokenFromAuth) {
      return tokenFromAuth;
    }
    const tokenFromQuery = this.toTokenValue(client.handshake.query?.token);
    if (tokenFromQuery) {
      return tokenFromQuery;
    }
    return null;
  }

  private toTokenValue(value: unknown): string | null {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    return null;
  }
}
