import {
  Body,
  Controller,
  Get,
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

@UseGuards(JwtAuthGuard)
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Post()
  create(@CurrentUser() userId: number, @Body() dto: CreateMatchDto) {
    return this.matchesService.createMatch(userId, dto);
  }

  @Get('upcoming')
  listUpcoming(@CurrentUser() userId: number) {
    return this.matchesService.listUpcoming(userId);
  }

  @Post(':id/score')
  reportScore(
    @CurrentUser() userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReportScoreDto,
  ) {
    return this.matchesService.reportScore(userId, id, dto);
  }
}
