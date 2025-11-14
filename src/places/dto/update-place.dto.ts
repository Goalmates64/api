import { Transform } from 'class-transformer';
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
import { toOptionalNumber, toTrimmedString, toUppercaseCountry } from './transformers';

export class UpdatePlaceDto {
  @Transform(toTrimmedString)
  @IsString()
  @IsOptional()
  @MaxLength(120)
  @IsNotEmpty()
  name?: string;

  @Transform(toTrimmedString)
  @IsString()
  @IsOptional()
  @MaxLength(120)
  @IsNotEmpty()
  city?: string;

  @Transform(toUppercaseCountry)
  @IsString()
  @IsOptional()
  @Length(2, 2)
  @IsIn(ISO_COUNTRY_CODES)
  countryCode?: string;

  @Transform(toOptionalNumber)
  @IsLatitude()
  @IsOptional()
  lat?: number;

  @Transform(toOptionalNumber)
  @IsLongitude()
  @IsOptional()
  lng?: number;
}
