import { Transform } from 'class-transformer';
import { IsInt, IsLatitude, IsLongitude, IsOptional, Max, Min } from 'class-validator';
import { toOptionalNumber, toRequiredNumber } from './transformers';

export class NearbyPlacesQueryDto {
  @Transform(toRequiredNumber)
  @IsLatitude()
  lat: number;

  @Transform(toRequiredNumber)
  @IsLongitude()
  lng: number;

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(100)
  @Max(20000)
  radius?: number;
}
