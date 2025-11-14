import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { toOptionalNumber } from './transformers';

export class ListPlacesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  query?: string;

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
