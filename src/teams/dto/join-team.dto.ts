import { IsNotEmpty, Length } from 'class-validator';

export class JoinTeamDto {
  @IsNotEmpty()
  @Length(8, 16)
  code: string;
}
