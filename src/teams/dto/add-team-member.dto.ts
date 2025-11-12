import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AddTeamMemberDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  username: string;
}
