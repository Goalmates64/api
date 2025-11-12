import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';

import { Team } from './team.entity';
import { TeamMember } from './team-member.entity';
import { CreateTeamDto } from './dto/create-team.dto';
import { JoinTeamDto } from './dto/join-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { User } from '../users/user.entity';

@Injectable()
export class TeamsService {
  constructor(
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
    @InjectRepository(TeamMember)
    private readonly memberRepo: Repository<TeamMember>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async createTeam(userId: number, dto: CreateTeamDto) {
    const existing = await this.teamRepo.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException("Ce nom d'équipe est déjà utilisé.");
    }

    const inviteCode = await this.generateUniqueInviteCode();
    const team = this.teamRepo.create({ name: dto.name, inviteCode });
    await this.teamRepo.save(team);

    const membership = this.memberRepo.create({
      teamId: team.id,
      userId,
      isCaptain: true,
    });
    await this.memberRepo.save(membership);

    return this.loadTeamWithMembers(team.id);
  }

  async joinTeam(userId: number, dto: JoinTeamDto) {
    const team = await this.teamRepo.findOne({
      where: { inviteCode: dto.code },
    });
    if (!team) {
      throw new NotFoundException("Code d'invitation invalide.");
    }

    const alreadyMember = await this.memberRepo.findOne({
      where: { teamId: team.id, userId },
    });
    if (alreadyMember) {
      throw new ConflictException('Tu fais déjà partie de cette équipe.');
    }

    const membership = this.memberRepo.create({
      teamId: team.id,
      userId,
      isCaptain: false,
    });
    await this.memberRepo.save(membership);

    return this.loadTeamWithMembers(team.id);
  }

  async getUserTeams(userId: number) {
    const teams = await this.teamRepo
      .createQueryBuilder('team')
      .innerJoin(
        'team.members',
        'membership',
        'membership.teamId = team.id AND membership.userId = :userId',
        { userId },
      )
      .leftJoinAndSelect('team.members', 'member')
      .leftJoinAndSelect('member.user', 'memberUser')
      .addSelect(['memberUser.id', 'memberUser.username', 'memberUser.email'])
      .orderBy('team.createdAt', 'DESC')
      .getMany();

    return teams.map((team) => this.mapTeamRelations(team));
  }

  async getTeamForUser(teamId: number, userId: number) {
    await this.ensureUserInTeam(userId, teamId);
    return this.loadTeamWithMembers(teamId);
  }

  async updateTeam(userId: number, teamId: number, dto: UpdateTeamDto) {
    const newName = dto.name?.trim();
    if (!newName) {
      return this.getTeamForUser(teamId, userId);
    }

    const membership = await this.ensureUserInTeam(userId, teamId);
    if (!membership.isCaptain) {
      throw new ForbiddenException('Seul le capitaine peut modifier l’équipe.');
    }

    const existing = await this.teamRepo.findOne({ where: { name: newName } });
    if (existing && existing.id !== teamId) {
      throw new ConflictException("Ce nom d'équipe est déjà utilisé.");
    }

    await this.teamRepo.update(teamId, { name: newName });
    return this.loadTeamWithMembers(teamId);
  }

  async addMemberByUsername(
    userId: number,
    teamId: number,
    dto: AddTeamMemberDto,
  ) {
    const membership = await this.ensureUserInTeam(userId, teamId);
    if (!membership.isCaptain) {
      throw new ForbiddenException(
        'Seul le capitaine peut inviter de nouveaux joueurs.',
      );
    }

    const username = dto.username.trim();
    if (!username) {
      throw new BadRequestException('Pseudo requis.');
    }
    const user = await this.userRepo.findOne({ where: { username } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

    const alreadyMember = await this.memberRepo.findOne({
      where: { teamId, userId: user.id },
    });
    if (alreadyMember) {
      throw new ConflictException('Ce joueur fait déjà partie de l’équipe.');
    }

    const newMember = this.memberRepo.create({
      teamId,
      userId: user.id,
      isCaptain: false,
    });
    await this.memberRepo.save(newMember);

    return this.loadTeamWithMembers(teamId);
  }

  async ensureUserInTeam(userId: number, teamId: number) {
    const membership = await this.memberRepo.findOne({
      where: { userId, teamId },
    });
    if (!membership) {
      throw new ForbiddenException('Accès refusé à cette équipe.');
    }
    return membership;
  }

  async loadTeamWithMembers(id: number) {
    const team = await this.teamRepo
      .createQueryBuilder('team')
      .leftJoinAndSelect('team.members', 'member')
      .leftJoinAndSelect('member.user', 'memberUser')
      .addSelect(['memberUser.id', 'memberUser.username', 'memberUser.email'])
      .where('team.id = :id', { id })
      .getOne();

    if (!team) {
      throw new NotFoundException('Équipe introuvable');
    }

    return this.mapTeamRelations(team);
  }

  private mapTeamRelations(team: Team) {
    return {
      ...team,
      memberCount: team.members?.length ?? 0,
      members: team.members?.map((member) => ({
        id: member.id,
        userId: member.userId,
        teamId: member.teamId,
        isCaptain: member.isCaptain,
        joinedAt: member.joinedAt,
        user: member.user
          ? {
              id: member.user.id,
              username: member.user.username,
              email: member.user.email,
            }
          : null,
      })),
    };
  }

  private async generateUniqueInviteCode(): Promise<string> {
    for (let i = 0; i < 5; i += 1) {
      const candidate = randomBytes(4).toString('hex').toUpperCase();
      const exists = await this.teamRepo.findOne({
        where: { inviteCode: candidate },
      });
      if (!exists) {
        return candidate;
      }
    }
    throw new BadRequestException(
      "Impossible de générer un code d'invitation unique.",
    );
  }
}
