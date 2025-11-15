import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { PlacesService } from './places.service';
import { SearchPlacesDto } from './dto/search-places.dto';
import { ListPlacesQueryDto } from './dto/list-places-query.dto';
import { NearbyPlacesQueryDto } from './dto/nearby-places-query.dto';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';

@Controller('places')
export class PlacesController {
  private readonly logger = new Logger(PlacesController.name);

  constructor(private readonly placesService: PlacesService) {}

  @Get()
  search(@Query() query: SearchPlacesDto) {
    if (!query.query?.trim()) {
      return [];
    }
    this.logger.log(`Recherche de lieux par nom: "${query.query}"`);
    return this.placesService.searchByName(query);
  }

  @Get('list')
  list(@Query() query: ListPlacesQueryDto) {
    this.logger.log(`Listing des lieux page ${query.page ?? 1}`);
    return this.placesService.list(query);
  }

  @Get('nearby')
  nearby(@Query() query: NearbyPlacesQueryDto) {
    this.logger.log(
      `Recherche de lieux autour de ${query.lat},${query.lng} (r=${query.radius ?? 1000}m)`,
    );
    return this.placesService.nearby(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`Lecture du lieu ${id}`);
    return this.placesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePlaceDto) {
    this.logger.log(`Creation d'un lieu ${dto.name}`);
    return this.placesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePlaceDto) {
    this.logger.log(`Mise a jour du lieu ${id}`);
    return this.placesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`Suppression du lieu ${id}`);
    return this.placesService.remove(id);
  }
}
