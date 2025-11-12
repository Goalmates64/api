import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Place } from './place.entity';
import { PlacesService } from './places.service';
import { PlacesController } from './places.controller';
import { Match } from '../matches/match.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Place, Match])],
  providers: [PlacesService],
  controllers: [PlacesController],
})
export class PlacesModule {}
