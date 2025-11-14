import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Match } from '../matches/match.entity';
import { MatchAttendance } from '../matches/attendance/match-attendance.entity';
import { MatchStatus } from '../matches/match-status.enum';
import { MatchAttendanceStatus } from '../matches/attendance/match-attendance-status.enum';
import { Team } from '../teams/team.entity';
import { TeamMember } from '../teams/team-member.entity';
import { Place } from '../places/place.entity';
import { NotificationsService, NotificationSummary } from '../notifications/notifications.service';
import {
  DashboardActivityDto,
  DashboardMatchAttendanceDto,
  DashboardMatchDto,
  DashboardMatchSummaryDto,
  DashboardOverviewDto,
  DashboardQuickActionDto,
  DashboardStatDto,
  DashboardTeamDto,
  DashboardUpcomingMatchDto,
  RecommendedPlaceDto,
  TeamAvailabilityDto,
  TrainingFocusDto,
  WeeklyMatchLoadDto,
} from './dashboard-overview.dto';

@Injectable()
export class DashboardService {
  private readonly quickActions: DashboardQuickActionDto[] = [
    {
      id: 'match',
      title: 'Programmer un match',
      description: 'Bloque un créneau et préviens instantanément tes équipes.',
      icon: 'fa-regular fa-futbol',
      route: '/matches/create',
      accent: 'bg-emerald-500/10 text-emerald-300',
    },
    {
      id: 'team',
      title: 'Créer une équipe',
      description: "Invites tes potes et partage un code d'accès.",
      icon: 'fa-solid fa-people-group',
      route: '/teams/create',
      accent: 'bg-indigo-500/10 text-indigo-300',
    },
    {
      id: 'place',
      title: 'Réserver un terrain',
      description: 'Centralise vos lieux favoris et garde les disponibilités.',
      icon: 'fa-solid fa-location-dot',
      route: '/places',
      accent: 'bg-sky-500/10 text-sky-300',
    },
    {
      id: 'chat',
      title: 'Ouvrir le chat',
      description: 'Décide de la compo finale directement avec ton groupe.',
      icon: 'fa-solid fa-comments',
      route: '/chat',
      accent: 'bg-amber-500/10 text-amber-300',
    },
  ];
  constructor(
    @InjectRepository(TeamMember)
    private readonly memberRepo: Repository<TeamMember>,
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
    @InjectRepository(Match)
    private readonly matchRepo: Repository<Match>,
    @InjectRepository(Place)
    private readonly placeRepo: Repository<Place>,
    private readonly notificationsService: NotificationsService,
  ) {}
  async getOverview(userId: number): Promise<DashboardOverviewDto> {
    const teamIds = await this.getUserTeamIds(userId);
    const [teams, upcomingMatches, previousMatches, notifications] = await Promise.all([
      this.loadTeams(teamIds),
      this.loadUpcomingMatches(teamIds),
      this.loadHistoryMatches(teamIds),
      this.notificationsService.listForUser(userId),
    ]);
    const recommendedPlaces = await this.pickRecommendedPlaces(upcomingMatches, previousMatches);
    const stats = this.buildStats(teams, upcomingMatches, previousMatches, notifications);
    const nextMatch = this.buildNextMatchSummary(upcomingMatches, teams);
    const teamAvailability = this.buildTeamAvailability(teams, upcomingMatches);
    const recentActivity = this.buildRecentActivity(previousMatches, notifications);
    const weeklyLoad = this.buildWeeklyLoad(upcomingMatches);
    const trainingFocus = this.buildTrainingFocus(teams);
    const upcomingMatchesPreview = this.buildUpcomingPreview(upcomingMatches);
    return {
      stats,
      nextMatch,
      quickActions: this.quickActions,
      teamAvailability,
      recentActivity,
      weeklyLoad,
      recommendedPlaces,
      trainingFocus,
      upcomingMatchesPreview,
      raw: {
        teams: teams.map((team) => this.toTeamDto(team)),
        upcomingMatches: upcomingMatches.map((match) => this.toMatchDto(match)),
        previousMatches: previousMatches.map((match) => this.toMatchDto(match)),
        notifications,
        places: recommendedPlaces,
      },
    };
  }
  private async getUserTeamIds(userId: number): Promise<number[]> {
    const memberships = await this.memberRepo.find({
      where: { userId },
      select: ['teamId'],
    });
    return memberships.map((member) => member.teamId);
  }
  private async loadTeams(teamIds: number[]): Promise<Team[]> {
    if (!teamIds.length) {
      return [];
    }
    return this.teamRepo.find({
      where: { id: In(teamIds) },
      relations: { members: true },
      order: { createdAt: 'DESC' },
    });
  }
  private async loadUpcomingMatches(teamIds: number[]): Promise<Match[]> {
    if (!teamIds.length) {
      return [];
    }
    const now = new Date();
    return this.matchRepo
      .createQueryBuilder('match')
      .leftJoinAndSelect('match.homeTeam', 'homeTeam')
      .leftJoinAndSelect('match.awayTeam', 'awayTeam')
      .leftJoinAndSelect('match.place', 'place')
      .where('match.status = :status', { status: MatchStatus.SCHEDULED })
      .andWhere('match.scheduledAt >= :now', { now })
      .andWhere('(match.homeTeamId IN (:...teamIds) OR match.awayTeamId IN (:...teamIds))', {
        teamIds,
      })
      .orderBy('match.scheduledAt', 'ASC')
      .limit(20)
      .getMany();
  }
  private async loadHistoryMatches(teamIds: number[]): Promise<Match[]> {
    if (!teamIds.length) {
      return [];
    }
    return this.matchRepo
      .createQueryBuilder('match')
      .leftJoinAndSelect('match.homeTeam', 'homeTeam')
      .leftJoinAndSelect('match.awayTeam', 'awayTeam')
      .leftJoinAndSelect('match.place', 'place')
      .where('match.status IN (:...statuses)', {
        statuses: [MatchStatus.PLAYED, MatchStatus.CANCELED],
      })
      .andWhere('(match.homeTeamId IN (:...teamIds) OR match.awayTeamId IN (:...teamIds))', {
        teamIds,
      })
      .orderBy('match.scheduledAt', 'DESC')
      .limit(25)
      .getMany();
  }
  private async pickRecommendedPlaces(
    upcomingMatches: Match[],
    previousMatches: Match[],
  ): Promise<RecommendedPlaceDto[]> {
    const seen = new Set<number>();
    const ordered: Place[] = [];
    for (const match of [...upcomingMatches, ...previousMatches]) {
      if (match.place && match.place.id && !seen.has(match.place.id)) {
        seen.add(match.place.id);
        ordered.push(match.place);
      }
    }
    if (ordered.length < 3) {
      const fallback = await this.placeRepo.find({
        order: { createdAt: 'DESC' },
        take: 5,
      });
      for (const place of fallback) {
        if (!seen.has(place.id)) {
          seen.add(place.id);
          ordered.push(place);
        }
        if (ordered.length >= 3) {
          break;
        }
      }
    }
    return ordered.slice(0, 3).map((place) => this.toRecommendedPlace(place));
  }
  private buildStats(
    teams: Team[],
    upcomingMatches: Match[],
    previousMatches: Match[],
    notifications: NotificationSummary[],
  ): DashboardStatDto[] {
    const matchesPlayed = previousMatches.filter(
      (match) => match.status === MatchStatus.PLAYED,
    ).length;
    const availability = this.computeAverageAvailability(teams);
    const unreadNotifications = notifications.filter((notif) => !notif.isRead).length;
    return [
      {
        id: 'played',
        label: 'Matchs joués',
        value: matchesPlayed.toString(),
        trend: matchesPlayed > 0 ? 'up' : 'steady',
        trendLabel: matchesPlayed > 0 ? '+2 vs sem. dernière' : 'Planifie un match',
        badge: matchesPlayed > 4 ? 'Rythme élevé' : undefined,
      },
      {
        id: 'upcoming',
        label: 'Matchs à venir',
        value: upcomingMatches.length.toString(),
        trend: upcomingMatches.length ? 'up' : 'steady',
        trendLabel: upcomingMatches.length > 0 ? 'Calendrier rempli' : 'Ajoute une rencontre',
      },
      {
        id: 'availability',
        label: 'Présence confirmée',
        value: `${availability}%`,
        trend: availability >= 75 ? 'up' : availability >= 50 ? 'steady' : 'down',
        trendLabel: availability >= 75 ? 'Effectif stable' : 'Rappelle tes joueurs',
      },
      {
        id: 'notifications',
        label: 'Alertes en attente',
        value: unreadNotifications.toString(),
        trend: unreadNotifications > 0 ? 'up' : 'steady',
        trendLabel:
          unreadNotifications > 0
            ? `${unreadNotifications} notification${unreadNotifications > 1 ? 's' : ''}`
            : 'Tout est lu',
      },
    ];
  }
  private buildNextMatchSummary(matches: Match[], teams: Team[]): DashboardMatchSummaryDto | null {
    if (!matches.length) {
      return null;
    }
    const sorted = [...matches].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    const next = sorted[0];
    const homeTeamName = this.resolveTeamName(next.homeTeamId, next.homeTeam, teams);
    const awayTeamName = this.resolveTeamName(
      next.awayTeamId,
      next.awayTeam,
      teams,
      'Adversaire à confirmer',
    );
    return {
      id: next.id,
      startsAt: next.scheduledAt.toISOString(),
      placeName: next.place?.name ?? 'Lieu à confirmer',
      placeCity: next.place?.city ?? null,
      status: next.status === MatchStatus.SCHEDULED ? 'confirmed' : 'pending',
      homeTeamName,
      homeLogoUrl: next.homeTeam?.logoUrl ?? null,
      awayTeamName,
      awayLogoUrl: next.awayTeam?.logoUrl ?? null,
      readiness: this.estimateReadiness(next, teams),
    };
  }
  private buildTeamAvailability(teams: Team[], upcomingMatches: Match[]): TeamAvailabilityDto[] {
    return teams.slice(0, 4).map((team) => {
      const availabilityRate = this.computeTeamAvailability(team);
      const upcomingMatch = upcomingMatches.find(
        (match) => match.homeTeamId === team.id || match.awayTeamId === team.id,
      );
      return {
        id: `team-${team.id}`,
        teamName: team.name,
        availabilityRate,
        confidence: availabilityRate >= 80 ? 'high' : availabilityRate >= 55 ? 'medium' : 'low',
        nextMatchAt: upcomingMatch ? upcomingMatch.scheduledAt.toISOString() : null,
      };
    });
  }
  private buildRecentActivity(
    history: Match[],
    notifications: NotificationSummary[],
  ): DashboardActivityDto[] {
    const matchActivities: DashboardActivityDto[] = history.slice(0, 3).map((match) => {
      const opponent = match.awayTeam?.name ?? 'Adversaire';
      const scoreLabel =
        match.homeScore !== null && match.awayScore !== null
          ? `${match.homeScore}-${match.awayScore}`
          : 'Score à reporter';
      return {
        id: `match-${match.id}`,
        title: `${match.homeTeam?.name ?? 'Équipe'} vs ${opponent}`,
        description: match.place?.name ?? 'Score enregistré',
        timestamp: match.scheduledAt.toISOString(),
        type: 'match',
        statusLabel: scoreLabel,
      };
    });
    const notificationActivities: DashboardActivityDto[] = notifications
      .slice(0, 4)
      .map((notif) => ({
        id: `notif-${notif.id}`,
        title: notif.title,
        description: notif.body,
        timestamp: notif.createdAt.toISOString(),
        type: 'notification',
        statusLabel: notif.isRead ? 'Lu' : 'Nouveau',
      }));
    return [...matchActivities, ...notificationActivities].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }
  private buildWeeklyLoad(matches: Match[]): WeeklyMatchLoadDto[] {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 6 }).map((_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      const count = matches.filter((match) => this.isSameDay(match.scheduledAt, day)).length;
      return {
        dayLabel: index === 0 ? "Aujourd'hui" : this.getDayLabel(day),
        matches: count,
      };
    });
  }
  private buildTrainingFocus(teams: Team[]): TrainingFocusDto[] {
    const averageRosterSize = teams.length
      ? Math.round(teams.reduce((acc, team) => acc + this.getTeamSize(team), 0) / teams.length)
      : 0;
    const cohesion = this.clamp(Math.round((averageRosterSize / 10) * 100), 15, 100);
    return [
      {
        id: 'cohesion',
        title: "Cohésion d'équipe",
        progress: cohesion,
        badge: cohesion >= 75 ? 'Très bon' : 'À renforcer',
      },
      {
        id: 'intensity',
        title: 'Rythme de jeu',
        progress: this.clamp(cohesion - 10, 10, 95),
        badge: 'Stable',
      },
      {
        id: 'communication',
        title: 'Communication',
        progress: this.clamp(cohesion + 5, 20, 100),
        badge: 'En hausse',
      },
    ];
  }
  private buildUpcomingPreview(matches: Match[]): DashboardUpcomingMatchDto[] {
    return [...matches]
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
      .slice(0, 3)
      .map((match) => ({
        id: match.id,
        startsAt: match.scheduledAt.toISOString(),
        label: `${this.resolveTeamName(match.homeTeamId, match.homeTeam, [])} vs ${this.resolveTeamName(
          match.awayTeamId,
          match.awayTeam,
          [],
          'Adversaire',
        )}`,
        status: match.status,
      }));
  }
  private toTeamDto(team: Team): DashboardTeamDto {
    return {
      id: team.id,
      name: team.name,
      inviteCode: team.inviteCode,
      isPublic: team.isPublic,
      logoUrl: team.logoUrl ?? null,
      createdAt: team.createdAt ? team.createdAt.toISOString() : new Date().toISOString(),
      memberCount: this.getTeamSize(team),
      members: (team.members ?? []).map((member) => ({
        id: member.id,
        userId: member.userId,
        teamId: member.teamId,
        isCaptain: member.isCaptain,
        joinedAt: member.joinedAt ? member.joinedAt.toISOString() : new Date().toISOString(),
      })),
    };
  }
  private toMatchDto(match: Match): DashboardMatchDto {
    return {
      id: match.id,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      scheduledAt: match.scheduledAt.toISOString(),
      status: match.status,
      homeScore: match.homeScore ?? null,
      awayScore: match.awayScore ?? null,
      place: match.place
        ? {
            id: match.place.id,
            name: match.place.name,
            city: match.place.city,
          }
        : match.placeId
          ? { id: match.placeId, name: null, city: null }
          : null,
      homeTeam: match.homeTeam
        ? {
            id: match.homeTeam.id,
            name: match.homeTeam.name,
            logoUrl: match.homeTeam.logoUrl ?? null,
          }
        : undefined,
      awayTeam: match.awayTeam
        ? {
            id: match.awayTeam.id,
            name: match.awayTeam.name,
            logoUrl: match.awayTeam.logoUrl ?? null,
          }
        : undefined,
    };
  }
  private toAttendanceDto(attendance: MatchAttendance): DashboardMatchAttendanceDto {
    return {
      id: attendance.id,
      matchId: attendance.matchId,
      userId: attendance.userId,
      status: attendance.status,
      reason: attendance.reason ?? null,
      respondedAt: attendance.respondedAt ? attendance.respondedAt.toISOString() : null,
    };
  }
  private toRecommendedPlace(place: Place): RecommendedPlaceDto {
    return {
      id: place.id,
      name: place.name,
      city: place.city,
      countryCode: place.countryCode,
      distanceKm: null,
    };
  }
  private computeAverageAvailability(teams: Team[]): number {
    if (!teams.length) {
      return 0;
    }
    const total = teams.reduce((acc, team) => acc + this.computeTeamAvailability(team), 0);
    return Math.round(total / teams.length);
  }
  private computeTeamAvailability(team: Team): number {
    const rosterSize = this.getTeamSize(team);
    return this.clamp(Math.round((rosterSize / 8) * 100), 10, 100);
  }
  private getTeamSize(team: Team): number {
    return team.members?.length ?? 0;
  }
  private resolveTeamName(
    teamId: number,
    fallbackTeam: Team | undefined,
    knownTeams: Team[],
    emptyLabel = 'Équipe à confirmer',
  ): string {
    if (fallbackTeam?.name) {
      return fallbackTeam.name;
    }
    const fromCache = knownTeams.find((team) => team.id === teamId);
    if (fromCache?.name) {
      return fromCache.name;
    }
    return emptyLabel;
  }
  private estimateReadiness(match: Match, teams: Team[]): number {
    const homeTeam = teams.find((team) => team.id === match.homeTeamId) ?? match.homeTeam;
    const awayTeam = teams.find((team) => team.id === match.awayTeamId) ?? match.awayTeam;
    const homeScore = homeTeam ? this.computeTeamAvailability(homeTeam) : 60;
    const awayScore = awayTeam ? this.computeTeamAvailability(awayTeam) : 55;
    return Math.round((homeScore + awayScore) / 2);
  }
  private attendanceRateForTeam(team: Team | undefined, match: Match | null): number | null {
    if (!team?.members?.length || !match?.attendances?.length) {
      return null;
    }
    const memberIds = new Set(team.members.map((member) => member.userId));
    if (!memberIds.size) {
      return null;
    }
    const confirmed = match.attendances.filter(
      (attendance) =>
        attendance.status === MatchAttendanceStatus.PRESENT && memberIds.has(attendance.userId),
    ).length;
    return Math.round((confirmed / memberIds.size) * 100);
  }
  private isSameDay(first: Date, second: Date): boolean {
    return (
      first.getFullYear() === second.getFullYear() &&
      first.getMonth() === second.getMonth() &&
      first.getDate() === second.getDate()
    );
  }
  private getDayLabel(date: Date): string {
    const labels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    return labels[date.getDay()];
  }
  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
