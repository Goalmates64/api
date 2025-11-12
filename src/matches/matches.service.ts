import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Match } from './match.entity';
import { MatchStatus } from './match-status.enum';
import { CreateMatchDto } from './dto/create-match.dto';
import { ReportScoreDto } from './dto/report-score.dto';
import { Team } from '../teams/team.entity';
import { TeamMember } from '../teams/team-member.entity';

@Injectable()
export class MatchesService {
  constructor(
    @InjectRepository(Match)
    private readonly matchRepo: Repository<Match>,
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
    @InjectRepository(TeamMember)
    private readonly memberRepo: Repository<TeamMember>,
  ) {}

  async createMatch(userId: number, dto: CreateMatchDto) {
    if (dto.homeTeamId === dto.awayTeamId) {
      throw new BadRequestException(
        'Une équipe ne peut pas jouer contre elle-même.',
      );
    }

    const [homeTeam, awayTeam] = await Promise.all([
      this.teamRepo.findOne({ where: { id: dto.homeTeamId } }),
      this.teamRepo.findOne({ where: { id: dto.awayTeamId } }),
    ]);

    if (!homeTeam || !awayTeam) {
      throw new NotFoundException('Équipe introuvable.');
    }

    await this.ensureUserInTeams(userId, [homeTeam.id, awayTeam.id]);

    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Date de match invalide.');
    }

    const match = this.matchRepo.create({
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      scheduledAt,
      location: dto.location,
      status: MatchStatus.SCHEDULED,
    });

    const saved = await this.matchRepo.save(match);
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
      .where('match.status = :status', { status: MatchStatus.SCHEDULED })
      .andWhere('match.scheduledAt >= :now', { now: new Date() })
      .andWhere(
        '(match.homeTeamId IN (:...teamIds) OR match.awayTeamId IN (:...teamIds))',
        {
          teamIds,
        },
      )
      .orderBy('match.scheduledAt', 'ASC')
      .getMany();

    return matches.map((match) => this.attachTeams(match));
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
      .where(
        '(match.homeTeamId IN (:...teamIds) OR match.awayTeamId IN (:...teamIds))',
        {
          teamIds,
        },
      )
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

    return matches.map((match) => this.attachTeams(match));
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

  private async ensureUserInTeams(userId: number, teamIds: number[]) {
    const memberships = await this.memberRepo.count({
      where: { userId, teamId: In(teamIds) },
    });
    if (memberships === 0) {
      throw new ForbiddenException('Tu dois appartenir à l’une des équipes.');
    }
  }

  private async getUserTeamIds(userId: number): Promise<number[]> {
    const memberships = await this.memberRepo.find({ where: { userId } });
    return memberships.map((member) => member.teamId);
  }

  private async loadMatch(id: number) {
    const match = await this.matchRepo.findOne({ where: { id } });
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
    };
  }
}
