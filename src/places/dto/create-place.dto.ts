import { Transform } from 'class-transformer';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

import { ISO_COUNTRY_CODES } from '../iso-country-codes';
import {
  toRequiredNumber,
  toTrimmedString,
  toUppercaseCountry,
} from './transformers';

export class CreatePlaceDto {
  @Transform(toTrimmedString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @Transform(toTrimmedString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city: string;

  @Transform(toUppercaseCountry)
  @IsString()
  @Length(2, 2)
  @IsIn(ISO_COUNTRY_CODES)
  countryCode: string;

  @Transform(toRequiredNumber)
  @IsLatitude()
  lat: number;

  @Transform(toRequiredNumber)
  @IsLongitude()
  lng: number;
}
