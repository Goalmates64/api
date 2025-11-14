import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MatchesService } from './matches.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { ReportScoreDto } from './dto/report-score.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

@UseGuards(JwtAuthGuard)
@Controller('matches')
export class MatchesController {
  private readonly logger = new Logger(MatchesController.name);

  constructor(private readonly matchesService: MatchesService) {}

  @Post()
  create(@CurrentUser() userId: number, @Body() dto: CreateMatchDto) {
    this.logger.log(
      `User ${userId} scheduling match ${dto.homeTeamId} vs ${dto.awayTeamId} on ${dto.scheduledAt} at place ${dto.placeId}`,
    );
    return this.matchesService.createMatch(userId, dto);
  }

  @Get('upcoming')
  listUpcoming(@CurrentUser() userId: number) {
    this.logger.log(`Listing upcoming matches for user ${userId}`);
    return this.matchesService.listUpcoming(userId);
  }

  @Get('history')
  listHistory(@CurrentUser() userId: number) {
    this.logger.log(`Listing match history for user ${userId}`);
    return this.matchesService.listHistory(userId);
  }

  @Post(':id/score')
  reportScore(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReportScoreDto,
  ) {
    this.logger.log(`User ${userId} reporting score for match ${id}`);
    return this.matchesService.reportScore(userId, id, dto);
  }

  @Post(':id/attendance')
  respondAttendance(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceDto,
  ) {
    this.logger.log(
      `User ${userId} updating attendance for match ${id} with status ${dto.status}`,
    );
    return this.matchesService.respondAttendance(userId, id, dto);
  }
}
