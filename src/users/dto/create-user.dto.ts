import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsPastDateString } from '../../common/validators/is-past-date.decorator';

export class CreateUserDto {
  @IsNotEmpty()
  @MinLength(3)
  username: string;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string | null;

  @IsOptional()
  @IsPastDateString()
  dateOfBirth?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string | null;
}
