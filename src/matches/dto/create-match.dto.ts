import { IsDateString, IsInt, IsPositive } from 'class-validator';

export class CreateMatchDto {
  @IsInt()
  @IsPositive()
  homeTeamId: number;

  @IsInt()
  @IsPositive()
  awayTeamId: number;

  @IsDateString()
  scheduledAt: string;

  @IsInt() @IsPositive() placeId: number;
}
