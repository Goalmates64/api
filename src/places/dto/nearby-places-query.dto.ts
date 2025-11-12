import { Transform } from 'class-transformer';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class NearbyPlacesQueryDto {
  @Transform(({ value }) => Number(value))
  @IsLatitude()
  lat: number;

  @Transform(({ value }) => Number(value))
  @IsLongitude()
  lng: number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : value))
  @IsInt()
  @Min(100)
  @Max(20000)
  radius?: number;
}
