import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

import { ISO_COUNTRY_CODES } from '../iso-country-codes';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdatePlaceDto {
  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(120)
  @IsNotEmpty()
  name?: string;

  @Transform(trim)
  @IsString()
  @IsOptional()
  @MaxLength(120)
  @IsNotEmpty()
  city?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsOptional()
  @Length(2, 2)
  @IsIn(ISO_COUNTRY_CODES)
  countryCode?: string;

  @Type(() => Number)
  @IsLatitude()
  @IsOptional()
  lat?: number;

  @Type(() => Number)
  @IsLongitude()
  @IsOptional()
  lng?: number;
}
