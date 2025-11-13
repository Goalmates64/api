import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

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
  private readonly logger = new Logger(TeamsController.name);

  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  createTeam(@CurrentUser() userId: number, @Body() dto: CreateTeamDto) {
    this.logger.log(`User ${userId} creating team ${dto.name}`);
    return this.teamsService.createTeam(userId, dto);
  }

  @Post('join')
  joinTeam(@CurrentUser() userId: number, @Body() dto: JoinTeamDto) {
    this.logger.log(`User ${userId} joining team with code ${dto.code}`);
    return this.teamsService.joinTeam(userId, dto);
  }

  @Get('mine')
  getMine(@CurrentUser() userId: number) {
    this.logger.log(`Listing teams for user ${userId}`);
    return this.teamsService.getUserTeams(userId);
  }

  @Get('search')
  search(@Query('query') query = '') {
    this.logger.log(`Searching public teams with query="${query}"`);
    return this.teamsService.searchPublicTeams(query);
  }

  @Get(':id')
  getDetail(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    this.logger.log(`User ${userId} fetching team ${id}`);
    return this.teamsService.getTeamForUser(id, userId);
  }

  @Patch(':id')
  updateTeam(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTeamDto,
  ) {
    this.logger.log(`User ${userId} updating team ${id}`);
    return this.teamsService.updateTeam(userId, id, dto);
  }

  @Post(':id/logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  uploadLogo(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.logger.log(`User ${userId} uploading logo for team ${id}`);
    return this.teamsService.updateTeamLogo(userId, id, file);
  }

  @Post(':id/members')
  addMember(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddTeamMemberDto,
  ) {
    this.logger.log(`User ${userId} adding ${dto.username} to team ${id}`);
    return this.teamsService.addMemberByUsername(userId, id, dto);
  }
}
