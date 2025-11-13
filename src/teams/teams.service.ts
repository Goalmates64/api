import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
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
import { NotificationsService } from '../notifications/notifications.service';
import { BlobStorageService } from '../storage/blob-storage.service';

type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
};

type TeamWithCount = Team & { memberCount?: number };

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);
  constructor(
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
    @InjectRepository(TeamMember)
    private readonly memberRepo: Repository<TeamMember>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly blobStorage: BlobStorageService,
  ) {}

  async createTeam(userId: number, dto: CreateTeamDto) {
    const normalizedName = dto.name.trim();
    if (!normalizedName) {
      throw new BadRequestException("Nom d'équipe requis.");
    }

    const existing = await this.teamRepo.findOne({
      where: { name: normalizedName },
    });
    if (existing) {
      throw new ConflictException("Ce nom d'équipe est déjà utilisé.");
    }

    const inviteCode = await this.generateUniqueInviteCode();
    const team = this.teamRepo.create({
      name: normalizedName,
      inviteCode,
      isPublic: dto.isPublic ?? false,
    });
    await this.teamRepo.save(team);

    const membership = this.memberRepo.create({
      teamId: team.id,
      userId,
      isCaptain: true,
    });
    await this.memberRepo.save(membership);

    this.logger.log(
      `Team ${team.name} (#${team.id}) created by user ${userId}`,
    );
    return this.loadTeamWithMembers(team.id);
  }

  async joinTeam(userId: number, dto: JoinTeamDto) {
    const team = await this.teamRepo.findOne({
      where: { inviteCode: dto.code },
    });
    if (!team) {
      this.logger.warn(`User ${userId} tried invalid join code ${dto.code}`);
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

    this.logger.log(`User ${userId} joined team ${team.id}`);
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

  async searchPublicTeams(query: string) {
    const trimmed = query?.trim();
    if (!trimmed || trimmed.length < 2) {
      return [];
    }

    const teams = await this.teamRepo
      .createQueryBuilder('team')
      .where('team.isPublic = :isPublic', { isPublic: true })
      .andWhere('team.name LIKE :query', { query: `%${trimmed}%` })
      .orderBy('team.name', 'ASC')
      .limit(10)
      .loadRelationCountAndMap('team.memberCount', 'team.members')
      .getMany();

    return teams.map((team) => ({
      id: team.id,
      name: team.name,
      logoUrl: team.logoUrl ?? null,
      isPublic: team.isPublic,
      memberCount: this.extractMemberCount(team as TeamWithCount),
    }));
  }

  async getTeamForUser(teamId: number, userId: number) {
    await this.ensureUserInTeam(userId, teamId);
    return this.loadTeamWithMembers(teamId);
  }

  async updateTeam(userId: number, teamId: number, dto: UpdateTeamDto) {
    const membership = await this.ensureUserInTeam(userId, teamId);
    if (!membership.isCaptain) {
      throw new ForbiddenException("Seul le capitaine peut modifier l'équipe.");
    }

    const updates: Partial<Team> = {};
    const newName = dto.name?.trim();
    if (newName) {
      const existing = await this.teamRepo.findOne({
        where: { name: newName },
      });
      if (existing && existing.id !== teamId) {
        throw new ConflictException("Ce nom d'équipe est déjà utilisé.");
      }
      updates.name = newName;
    }

    if (dto.isPublic !== undefined) {
      updates.isPublic = dto.isPublic;
    }

    if (!Object.keys(updates).length) {
      return this.loadTeamWithMembers(teamId);
    }

    await this.teamRepo.update(teamId, updates);
    this.logger.log(
      `User ${userId} updated team ${teamId} with fields: ${Object.keys(
        updates,
      ).join(', ')}`,
    );
    return this.loadTeamWithMembers(teamId);
  }

  async updateTeamLogo(userId: number, teamId: number, file: UploadedFile) {
    if (!file) {
      throw new BadRequestException('Fichier obligatoire.');
    }

    const membership = await this.ensureUserInTeam(userId, teamId);
    if (!membership.isCaptain) {
      throw new ForbiddenException("Seul le capitaine peut modifier l'équipe.");
    }

    const team = await this.teamRepo.findOne({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException('Équipe introuvable.');
    }

    this.ensureFileIsImage(file);

    const extension = this.detectExtension(file);
    const uploadResult = await this.blobStorage.uploadObject(
      `team-logos/${team.id}/logo${extension ? `.${extension}` : ''}`,
      file.buffer,
      {
        access: 'public',
        contentType: file.mimetype,
        addUniqueSuffix: true,
      },
    );

    await this.deleteExistingLogo(team.logoPath, uploadResult.pathname);

    team.logoUrl =
      uploadResult.downloadUrl ?? uploadResult.url ?? team.logoUrl ?? null;
    team.logoPath = uploadResult.pathname;

    await this.teamRepo.save(team);
    this.logger.log(`User ${userId} updated logo for team ${teamId}`);
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

    const team = await this.teamRepo.findOne({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException('Équipe introuvable.');
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
      throw new ConflictException("Ce joueur fait déjà partie de l'équipe.");
    }

    const newMember = this.memberRepo.create({
      teamId,
      userId: user.id,
      isCaptain: false,
    });
    await this.memberRepo.save(newMember);

    await this.notificationsService.createNotification({
      senderId: userId,
      receiverId: user.id,
      title: 'Nouvelle équipe',
      body: `Tu viens d'être ajouté à l'équipe ${team.name}.`,
    });

    this.logger.log(`User ${user.id} added to team ${teamId} by ${userId}`);
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
      memberCount: this.extractMemberCount(team as TeamWithCount),
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

  private extractMemberCount(team: TeamWithCount): number {
    if (typeof team.memberCount === 'number') {
      return team.memberCount;
    }
    return team.members?.length ?? 0;
  }

  private async deleteExistingLogo(
    currentPath: string | null,
    nextPath?: string,
  ) {
    if (!currentPath || currentPath === nextPath) {
      return;
    }
    try {
      await this.blobStorage.deleteObject(currentPath);
    } catch (error) {
      this.logger.warn(
        `Unable to delete previous team logo ${currentPath}: ${String(error)}`,
      );
    }
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
