import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: CreateUserDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email deja utilise');
    }

    const user = await this.usersService.create(dto);
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    return this.buildAuthResponse(user);
  }

  async getProfile(userId: number) {
    const profile = await this.usersService.getProfile(userId);
    if (!profile) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    return profile;
  }

  private buildAuthResponse(user: User) {
    const payload = { sub: user.id, email: user.email };
    const access_token = this.jwtService.sign(payload);
    return {
      access_token,
      user: this.usersService.toProfile(user),
    };
  }
}
