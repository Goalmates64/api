import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './users/user.entity';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { Team } from './teams/team.entity';
import { TeamMember } from './teams/team-member.entity';
import { TeamsModule } from './teams/teams.module';
import { Match } from './matches/match.entity';
import { Place } from './places/place.entity';
import { MatchesModule } from './matches/matches.module';
import { PlacesModule } from './places/places.module';
import { Notification } from './notifications/notification.entity';
import { NotificationsModule } from './notifications/notifications.module';
import { BlobStorageModule } from './storage/blob-storage.module';
import { ChatRoom } from './chat/chat-room.entity';
import { ChatMessage } from './chat/chat-message.entity';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? ['.env']
          : ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        entities: [
          User,
          Team,
          TeamMember,
          Match,
          Notification,
          ChatRoom,
          ChatMessage,
          Place,
        ],
        synchronize: true, // DEV UNIQUEMENT
        legacySpatialSupport: false,
      }),
    }),
    UsersModule,
    AuthModule,
    TeamsModule,
    MatchesModule,
    NotificationsModule,
    BlobStorageModule,
    ChatModule,
    PlacesModule,
  ],
})
export class AppModule {}
