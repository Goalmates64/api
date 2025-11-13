import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Team } from './team.entity';
import { TeamMember } from './team-member.entity';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';
import { User } from '../users/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { BlobStorageModule } from '../storage/blob-storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Team, TeamMember, User]),
    NotificationsModule,
    BlobStorageModule,
  ],
  providers: [TeamsService],
  controllers: [TeamsController],
  exports: [TeamsService],
})
export class TeamsModule {}
