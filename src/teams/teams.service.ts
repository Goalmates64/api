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

@Injectable()
export class TeamsService {
  constructor(
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
    @InjectRepository(TeamMember)
    private readonly memberRepo: Repository<TeamMember>,
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
        {
          userId,
        },
      )
      .leftJoinAndSelect('team.members', 'member')
      .leftJoinAndSelect('member.user', 'memberUser')
      .addSelect(['memberUser.id', 'memberUser.username', 'memberUser.email'])
      .orderBy('team.createdAt', 'DESC')
      .getMany();

    return teams.map((team) => this.mapTeamRelations(team));
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
