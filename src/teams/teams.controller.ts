import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { JoinTeamDto } from './dto/join-team.dto';

@UseGuards(JwtAuthGuard)
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  createTeam(@CurrentUser() userId: number, @Body() dto: CreateTeamDto) {
    return this.teamsService.createTeam(userId, dto);
  }

  @Post('join')
  joinTeam(@CurrentUser() userId: number, @Body() dto: JoinTeamDto) {
    return this.teamsService.joinTeam(userId, dto);
  }

  @Get('mine')
  getMine(@CurrentUser() userId: number) {
    return this.teamsService.getUserTeams(userId);
  }
}
