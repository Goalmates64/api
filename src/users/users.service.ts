import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserProfileDto } from './dto/user-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = this.repo.create({
      email: dto.email,
      username: dto.username,
      passwordHash,
      firstName: this.normalizeNullableString(dto.firstName),
      lastName: this.normalizeNullableString(dto.lastName),
      dateOfBirth: this.normalizeNullableString(dto.dateOfBirth),
      city: this.normalizeNullableString(dto.city),
      country: this.normalizeNullableString(dto.country),
    });

    return this.repo.save(user);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  findById(id: number): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  async getProfile(userId: number): Promise<UserProfileDto | null> {
    const user = await this.findById(userId);
    return user ? this.toProfile(user) : null;
  }

  async updateProfile(
    userId: number,
    dto: UpdateProfileDto,
  ): Promise<UserProfileDto> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (dto.firstName !== undefined) {
      user.firstName = this.normalizeNullableString(dto.firstName);
    }

    if (dto.lastName !== undefined) {
      user.lastName = this.normalizeNullableString(dto.lastName);
    }

    if (dto.dateOfBirth !== undefined) {
      user.dateOfBirth = this.normalizeNullableString(dto.dateOfBirth);
    }

    if (dto.city !== undefined) {
      user.city = this.normalizeNullableString(dto.city);
    }

    if (dto.country !== undefined) {
      user.country = this.normalizeNullableString(dto.country);
    }

    await this.repo.save(user);
    return this.toProfile(user);
  }

  toProfile(user: User): UserProfileDto {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      dateOfBirth: user.dateOfBirth ?? null,
      city: user.city ?? null,
      country: user.country ?? null,
    };
  }

  private normalizeNullableString(value?: string | null): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
