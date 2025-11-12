import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { JoinTeamDto } from './dto/join-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AddTeamMemberDto } from './dto/add-team-member.dto';

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

  @Get(':id')
  getDetail(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.teamsService.getTeamForUser(id, userId);
  }

  @Patch(':id')
  updateTeam(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamsService.updateTeam(userId, id, dto);
  }

  @Post(':id/members')
  addMember(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddTeamMemberDto,
  ) {
    return this.teamsService.addMemberByUsername(userId, id, dto);
  }
}
