import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';

import { Place } from './place.entity';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { ListPlacesQueryDto } from './dto/list-places-query.dto';
import { NearbyPlacesQueryDto } from './dto/nearby-places-query.dto';
import { SearchPlacesDto } from './dto/search-places.dto';
import { Match } from '../matches/match.entity';

const DISTANCE_SQL = 'ST_Distance_Sphere(place.location, ST_SRID(POINT(:lng,:lat), 4326))';

export interface PlaceWithDistance {
  id: number;
  name: string;
  city: string;
  countryCode: string;
  lat: number;
  lng: number;
  distance: number;
}

interface NormalizedPlaceInput {
  name: string;
  city: string;
  countryCode: string;
  lat: number;
  lng: number;
}

@Injectable()
export class PlacesService {
  constructor(
    @InjectRepository(Place)
    private readonly placeRepo: Repository<Place>,
    @InjectRepository(Match)
    private readonly matchRepo: Repository<Match>,
  ) {}

  async create(dto: CreatePlaceDto) {
    const normalized = this.normalizeInput(dto);
    await this.ensureNoConflict(normalized.lat, normalized.lng);

    const insertResult = await this.placeRepo
      .createQueryBuilder()
      .insert()
      .values({
        name: normalized.name,
        city: normalized.city,
        countryCode: normalized.countryCode,
        lat: normalized.lat,
        lng: normalized.lng,
        location: () => this.buildPointExpression('insertLng', 'insertLat'),
      })
      .setParameters({ insertLat: normalized.lat, insertLng: normalized.lng })
      .execute();

    const identifierId = this.pickNumber(insertResult.identifiers[0]?.id);
    const rawId = this.pickNumber(
      (insertResult.raw as Record<string, unknown> | undefined)?.insertId,
    );
    const insertedId = identifierId ?? rawId;
    if (!insertedId) {
      throw new InternalServerErrorException('Impossible de récupérer le lieu créé.');
    }
    return this.findOne(insertedId);
  }

  async searchByName(dto: SearchPlacesDto) {
    const query = dto.query?.trim();
    if (!query) {
      return [];
    }

    const limit = Math.min(Math.max(dto.limit ?? 10, 1), 25);

    return this.placeRepo.find({
      where: { name: Like(`%${query}%`) },
      order: { name: 'ASC' },
      take: limit,
    });
  }

  async list(dto: ListPlacesQueryDto) {
    const page = dto.page && dto.page > 0 ? dto.page : 1;
    const limit = dto.limit && dto.limit > 0 ? Math.min(dto.limit, 50) : 20;
    const qb = this.placeRepo.createQueryBuilder('place').orderBy('place.createdAt', 'DESC');

    if (dto.query?.trim()) {
      const term = `%${dto.query.trim()}%`;
      qb.andWhere('(place.name LIKE :term OR place.city LIKE :term)', { term });
    }

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      meta: {
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit) || 1,
      },
    };
  }

  async nearby(dto: NearbyPlacesQueryDto) {
    const radius = dto.radius ?? 1000;
    return this.findNearby(dto.lat, dto.lng, radius, 25);
  }

  async findOne(id: number) {
    const place = await this.placeRepo.findOne({ where: { id } });
    if (!place) {
      throw new NotFoundException('Lieu introuvable.');
    }
    return place;
  }

  async update(id: number, dto: UpdatePlaceDto) {
    const place = await this.findOne(id);

    const nextValues: NormalizedPlaceInput = {
      name: dto.name !== undefined ? dto.name.trim() : place.name,
      city: dto.city !== undefined ? dto.city.trim() : place.city,
      countryCode:
        dto.countryCode !== undefined ? dto.countryCode.trim().toUpperCase() : place.countryCode,
      lat: dto.lat ?? place.lat,
      lng: dto.lng ?? place.lng,
    };

    const hasCoordChange = dto.lat !== undefined || dto.lng !== undefined;
    if (hasCoordChange) {
      await this.ensureNoConflict(nextValues.lat, nextValues.lng, id);
    }

    place.name = nextValues.name;
    place.city = nextValues.city;
    place.countryCode = nextValues.countryCode;
    place.lat = nextValues.lat;
    place.lng = nextValues.lng;

    await this.placeRepo.save(place);
    await this.updateLocationPoint(place.id, place.lat, place.lng);

    return place;
  }

  async remove(id: number) {
    const place = await this.findOne(id);
    const usageCount = await this.matchRepo.count({ where: { placeId: id } });
    if (usageCount > 0) {
      throw new ConflictException(
        'Impossible de supprimer ce lieu car des matchs y sont rattachés.',
      );
    }
    await this.placeRepo.remove(place);
    return { success: true };
  }

  private async ensureNoConflict(lat: number, lng: number, excludeId?: number) {
    const conflicts = await this.findNearby(lat, lng, 1000, 5, excludeId);
    if (conflicts.length) {
      throw new ConflictException({
        message: 'Un lieu existe déjà à proximité (<= 1 km).',
        conflicts,
      });
    }
  }

  private async findNearby(
    lat: number,
    lng: number,
    radius: number,
    limit: number,
    excludeId?: number,
  ): Promise<PlaceWithDistance[]> {
    const qb = this.placeRepo
      .createQueryBuilder('place')
      .select([
        'place.id AS id',
        'place.name AS name',
        'place.city AS city',
        'place.countryCode AS countryCode',
        'place.lat AS lat',
        'place.lng AS lng',
      ])
      .addSelect(DISTANCE_SQL, 'distance')
      .where(`${DISTANCE_SQL} <= :radius`, { radius })
      .setParameters({ lat, lng })
      .orderBy('distance', 'ASC')
      .limit(limit);

    if (excludeId) {
      qb.andWhere('place.id != :excludeId', { excludeId });
    }

    type NearbyRow = {
      id: number | string;
      name: string;
      city: string;
      countryCode: string;
      lat: number | string;
      lng: number | string;
      distance: number | string;
    };

    const rows = await qb.getRawMany<NearbyRow>();
    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      city: row.city,
      countryCode: row.countryCode,
      lat: Number(row.lat),
      lng: Number(row.lng),
      distance: Number(row.distance),
    }));
  }

  private normalizeInput(dto: CreatePlaceDto): NormalizedPlaceInput {
    return {
      name: dto.name.trim(),
      city: dto.city.trim(),
      countryCode: dto.countryCode.trim().toUpperCase(),
      lat: dto.lat,
      lng: dto.lng,
    };
  }

  private buildPointExpression(lngParam: string, latParam: string) {
    return `ST_SRID(POINT(:${lngParam}, :${latParam}), 4326)`;
  }

  private async updateLocationPoint(id: number, lat: number, lng: number) {
    await this.placeRepo
      .createQueryBuilder()
      .update(Place)
      .set({
        location: () => this.buildPointExpression('updateLng', 'updateLat'),
      })
      .where('id = :id', { id })
      .setParameters({ updateLat: lat, updateLng: lng })
      .execute();
  }

  private pickNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }
}
