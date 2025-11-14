import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Match } from './match.entity';
import { MatchAttendance } from './attendance/match-attendance.entity';
import { MatchStatus } from './match-status.enum';
import { CreateMatchDto } from './dto/create-match.dto';
import { ReportScoreDto } from './dto/report-score.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { Team } from '../teams/team.entity';
import { TeamMember } from '../teams/team-member.entity';
import { Place } from '../places/place.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class MatchesService {
  constructor(
    @InjectRepository(Match)
    private readonly matchRepo: Repository<Match>,

    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,

    @InjectRepository(TeamMember)
    private readonly memberRepo: Repository<TeamMember>,

    @InjectRepository(Place)
    private readonly placeRepo: Repository<Place>,

    @InjectRepository(MatchAttendance)
    private readonly attendanceRepo: Repository<MatchAttendance>,

    private readonly notificationsService: NotificationsService,
  ) {}

  async createMatch(userId: number, dto: CreateMatchDto) {
    if (dto.homeTeamId === dto.awayTeamId) {
      throw new BadRequestException('Une équipe ne peut pas jouer contre elle-même.');
    }

    const [homeTeam, awayTeam] = await Promise.all([
      this.teamRepo.findOne({ where: { id: dto.homeTeamId } }),
      this.teamRepo.findOne({ where: { id: dto.awayTeamId } }),
    ]);

    if (!homeTeam || !awayTeam) {
      throw new NotFoundException('Équipe introuvable.');
    }

    const [homeMembership, awayMembership] = await Promise.all([
      this.memberRepo.findOne({ where: { teamId: homeTeam.id, userId } }),
      this.memberRepo.findOne({ where: { teamId: awayTeam.id, userId } }),
    ]);

    if (!homeMembership) {
      throw new ForbiddenException(
        "Tu dois appartenir à l'équipe domicile pour programmer un match.",
      );
    }

    if (!awayMembership && !awayTeam.isPublic) {
      throw new ForbiddenException(
        'Cette équipe est privée. Tu dois en faire partie pour la défier.',
      );
    }

    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Date de match invalide.');
    }

    const place = await this.placeRepo.findOne({ where: { id: dto.placeId } });
    if (!place) {
      throw new NotFoundException('Lieu introuvable.');
    }

    const match = this.matchRepo.create({
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      scheduledAt,
      placeId: place.id,
      status: MatchStatus.SCHEDULED,
    });

    const saved = await this.matchRepo.save(match);

    await this.notifyPlayersAboutMatch({
      creatorId: userId,
      homeTeam,
      awayTeam,
      scheduledAt,
      place,
    });
    return this.loadMatch(saved.id);
  }

  async listUpcoming(userId: number) {
    const teamIds = await this.getUserTeamIds(userId);
    if (!teamIds.length) {
      return [];
    }

    const matches = await this.matchRepo
      .createQueryBuilder('match')
      .leftJoinAndSelect('match.homeTeam', 'homeTeam')
      .leftJoinAndSelect('match.awayTeam', 'awayTeam')
      .leftJoinAndSelect('match.place', 'place')
      .where('match.status = :status', { status: MatchStatus.SCHEDULED })
      .andWhere('match.scheduledAt >= :now', { now: new Date() })
      .andWhere('(match.homeTeamId IN (:...teamIds) OR match.awayTeamId IN (:...teamIds))', {
        teamIds,
      })
      .orderBy('match.scheduledAt', 'ASC')
      .getMany();

    const hydratedMatches = await this.hydrateAttendances(matches);

    return hydratedMatches.map((match) => this.attachTeams(match));
  }

  async listHistory(userId: number) {
    const teamIds = await this.getUserTeamIds(userId);
    if (!teamIds.length) {
      return [];
    }

    const matches = await this.matchRepo
      .createQueryBuilder('match')
      .leftJoinAndSelect('match.homeTeam', 'homeTeam')
      .leftJoinAndSelect('match.awayTeam', 'awayTeam')
      .leftJoinAndSelect('match.place', 'place')
      .where('(match.homeTeamId IN (:...teamIds) OR match.awayTeamId IN (:...teamIds))', {
        teamIds,
      })
      .andWhere(
        '(match.status IN (:...statuses)) OR (match.status = :scheduled AND match.scheduledAt < :now)',
        {
          statuses: [MatchStatus.PLAYED, MatchStatus.CANCELED],
          scheduled: MatchStatus.SCHEDULED,
          now: new Date(),
        },
      )
      .orderBy('match.scheduledAt', 'DESC')
      .limit(50)
      .getMany();

    const hydratedMatches = await this.hydrateAttendances(matches);

    return hydratedMatches.map((match) => this.attachTeams(match));
  }

  async reportScore(userId: number, matchId: number, dto: ReportScoreDto) {
    const match = await this.matchRepo.findOne({ where: { id: matchId } });
    if (!match) {
      throw new NotFoundException('Match introuvable');
    }

    const teamIds = [match.homeTeamId, match.awayTeamId];
    await this.ensureUserInTeams(userId, teamIds);

    match.homeScore = dto.homeScore;
    match.awayScore = dto.awayScore;
    match.status = MatchStatus.PLAYED;

    await this.matchRepo.save(match);
    return this.loadMatch(match.id);
  }

  async respondAttendance(
    userId: number,

    matchId: number,

    dto: UpdateAttendanceDto,
  ) {
    const match = await this.matchRepo.findOne({ where: { id: matchId } });

    if (!match) {
      throw new NotFoundException('Match introuvable');
    }

    await this.ensureUserInTeams(userId, [match.homeTeamId, match.awayTeamId]);

    const trimmedReason = dto.reason?.trim() || null;

    let attendance = await this.attendanceRepo.findOne({
      where: { matchId, userId },
    });

    if (!attendance) {
      attendance = this.attendanceRepo.create({ matchId, userId });
    }

    attendance.status = dto.status;

    attendance.reason = trimmedReason;

    attendance.respondedAt = new Date();

    await this.attendanceRepo.save(attendance);

    return this.loadMatch(matchId);
  }

  private async ensureUserInTeams(userId: number, teamIds: number[]) {
    const memberships = await this.memberRepo.count({
      where: { userId, teamId: In(teamIds) },
    });
    if (memberships === 0) {
      throw new ForbiddenException("Tu dois appartenir à l'une des équipes.");
    }
  }

  private async getUserTeamIds(userId: number): Promise<number[]> {
    const memberships = await this.memberRepo.find({ where: { userId } });
    return memberships.map((member) => member.teamId);
  }

  private async loadMatch(id: number) {
    const match = await this.matchRepo.findOne({
      where: { id },

      relations: { attendances: true },
    });

    if (!match) {
      throw new NotFoundException('Match introuvable');
    }

    return this.attachTeams(match);
  }

  private attachTeams(match: Match) {
    return {
      ...match,

      homeTeam: match.homeTeam ?? { id: match.homeTeamId },

      awayTeam: match.awayTeam ?? { id: match.awayTeamId },

      place: match.place ?? (match.placeId ? ({ id: match.placeId } as Place) : null),

      attendances: match.attendances ?? [],
    };
  }

  private async hydrateAttendances(matches: Match[]) {
    if (!matches.length) {
      return matches;
    }

    const matchIds = matches.map((match) => match.id);
    const attendances = await this.attendanceRepo.find({
      where: { matchId: In(matchIds) },
    });

    const grouped = attendances.reduce<Map<number, MatchAttendance[]>>((acc, attendance) => {
      if (!acc.has(attendance.matchId)) {
        acc.set(attendance.matchId, []);
      }
      acc.get(attendance.matchId)!.push(attendance);
      return acc;
    }, new Map());

    matches.forEach((match) => {
      match.attendances = grouped.get(match.id) ?? [];
    });

    return matches;
  }

  private async notifyPlayersAboutMatch(params: {
    creatorId: number;
    homeTeam: Team;
    awayTeam: Team;
    scheduledAt: Date;
    place: Place;
  }) {
    const teamIds = [params.homeTeam.id, params.awayTeam.id];
    const members = await this.memberRepo.find({
      where: { teamId: In(teamIds) },
      select: ['userId'],
    });
    const uniqueUserIds = Array.from(new Set(members.map((member) => member.userId)));
    if (!uniqueUserIds.length) {
      return;
    }

    const formattedDate = new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(params.scheduledAt);

    const placeLabel = `${params.place.name} (${params.place.city})`;

    const body = `Un match ${params.homeTeam.name} vs ${params.awayTeam.name} est prévu le ${formattedDate} à ${placeLabel}.`;

    await this.notificationsService.notifyMany(
      uniqueUserIds.map((receiverId) => ({
        senderId: params.creatorId,
        receiverId,
        title: 'Nouveau match programmé',
        body,
      })),
    );
  }
}
