import { IsString, Matches } from 'class-validator';

export class TwoFactorCodeDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}
