import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateMatchDto {
  @IsInt()
  @IsPositive()
  homeTeamId: number;

  @IsInt()
  @IsPositive()
  awayTeamId: number;

  @IsDateString()
  scheduledAt: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  location: string;
}
