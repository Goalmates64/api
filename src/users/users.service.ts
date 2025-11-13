import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserProfileDto } from './dto/user-profile.dto';
import { BlobStorageService } from '../storage/blob-storage.service';

type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
    private readonly blobStorage: BlobStorageService,
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
      isChatEnabled: true,
    });

    const saved = await this.repo.save(user);
    this.logger.log(`Created user id=${saved.id} email=${saved.email}`);
    return saved;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  findById(id: number): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  async searchByUsername(
    query: string,
  ): Promise<Array<Pick<User, 'id' | 'username' | 'email'>>> {
    const trimmed = query?.trim();
    if (!trimmed) {
      return [];
    }

    return this.repo
      .createQueryBuilder('user')
      .select(['user.id', 'user.username', 'user.email'])
      .where('user.username LIKE :query', { query: `%${trimmed}%` })
      .orderBy('user.username', 'ASC')
      .limit(10)
      .getMany();
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
      this.logger.error(`Attempt to update missing user ${userId}`);
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

    if (dto.isChatEnabled !== undefined) {
      user.isChatEnabled = dto.isChatEnabled;
    }

    await this.repo.save(user);
    this.logger.log(`Updated profile for user ${userId}`);
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
      avatarUrl: user.avatarUrl ?? null,
      isChatEnabled: user.isChatEnabled ?? true,
    };
  }

  async updateAvatar(
    userId: number,
    file: UploadedFile,
  ): Promise<UserProfileDto> {
    if (!file) {
      throw new BadRequestException('Fichier obligatoire.');
    }

    const user = await this.findById(userId);
    if (!user) {
      this.logger.error(`Attempt to upload avatar for missing user ${userId}`);
      throw new NotFoundException('Utilisateur introuvable');
    }

    this.ensureFileIsImage(file);

    const extension = this.detectExtension(file);
    const uploadResult = await this.blobStorage.uploadObject(
      `avatars/${user.id}/avatar${extension ? `.${extension}` : ''}`,
      file.buffer,
      {
        access: 'public',
        contentType: file.mimetype,
        addUniqueSuffix: true,
      },
    );

    user.avatarUrl =
      uploadResult.downloadUrl ?? uploadResult.url ?? user.avatarUrl;
    user.avatarPath = uploadResult.pathname;

    await this.repo.save(user);
    this.logger.log(`Updated avatar for user ${userId}`);
    return this.toProfile(user);
  }

  private ensureFileIsImage(file: UploadedFile) {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('Format de fichier non supporté.');
    }

    const maxBytes = 2 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException('Image trop volumineuse (max 2 Mo).');
    }
  }

  private detectExtension(file: UploadedFile): string | null {
    const original = file.originalname ?? '';
    const match = original.match(/\.([a-zA-Z0-9]+)$/);
    if (match) {
      return match[1].toLowerCase();
    }
    if (file.mimetype === 'image/png') {
      return 'png';
    }
    if (file.mimetype === 'image/jpeg') {
      return 'jpg';
    }
    if (file.mimetype === 'image/webp') {
      return 'webp';
    }
    return null;
  }

  private normalizeNullableString(value?: string | null): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
