import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { Match } from '../matches/match.entity';
import { Team } from '../teams/team.entity';
import { TeamMember } from '../teams/team-member.entity';
import { Place } from '../places/place.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([TeamMember, Team, Match, Place]), NotificationsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
