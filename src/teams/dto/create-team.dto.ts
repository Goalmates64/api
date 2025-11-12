import { IsNotEmpty, MaxLength, MinLength } from 'class-validator';

export class CreateTeamDto {
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(120)
  name: string;
}
