import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SearchPlacesDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  query?: string;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : 10))
  @IsInt()
  @Min(1)
  @Max(25)
  limit?: number;
}
