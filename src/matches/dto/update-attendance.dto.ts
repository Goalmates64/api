import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { MatchAttendanceStatus } from '../attendance/match-attendance-status.enum';

export class UpdateAttendanceDto {
  @IsEnum(MatchAttendanceStatus)
  status: MatchAttendanceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
