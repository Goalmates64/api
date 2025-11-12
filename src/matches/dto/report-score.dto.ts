import { IsInt, Min } from 'class-validator';

export class ReportScoreDto {
  @IsInt()
  @Min(0)
  homeScore: number;

  @IsInt()
  @Min(0)
  awayScore: number;
}
