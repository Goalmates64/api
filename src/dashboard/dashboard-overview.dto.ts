import { MatchStatus } from '../matches/match-status.enum';
import { MatchAttendanceStatus } from '../matches/attendance/match-attendance-status.enum';
import { NotificationSummary } from '../notifications/notifications.service';

export interface DashboardStatDto {
  id: string;
  label: string;
  value: string;
  trend: 'up' | 'down' | 'steady';
  trendLabel: string;
  badge?: string;
}
export interface DashboardMatchAttendanceDto {
  id: number;
  matchId: number;
  userId: number;
  status: MatchAttendanceStatus;
  reason: string | null;
  respondedAt: string | null;
}
export interface DashboardMatchSummaryDto {
  id: number;
  startsAt: string;
  placeName: string;
  placeCity: string | null;
  status: 'confirmed' | 'pending';
  homeTeamName: string;
  homeLogoUrl: string | null;
  awayTeamName: string;
  awayLogoUrl: string | null;
  readiness: number;
}
export interface DashboardQuickActionDto {
  id: string;
  title: string;
  description: string;
  icon: string;
  route: string;
  accent: string;
}
export interface TeamAvailabilityDto {
  id: string;
  teamName: string;
  availabilityRate: number;
  confidence: 'high' | 'medium' | 'low';
  nextMatchAt: string | null;
}
export interface DashboardActivityDto {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  type: 'match' | 'notification';
  statusLabel?: string;
}
export interface WeeklyMatchLoadDto {
  dayLabel: string;
  matches: number;
}
export interface RecommendedPlaceDto {
  id: number;
  name: string;
  city: string;
  countryCode: string;
  distanceKm: number | null;
}
export interface TrainingFocusDto {
  id: string;
  title: string;
  progress: number;
  badge: string;
}
export interface DashboardUpcomingMatchDto {
  id: number;
  startsAt: string;
  label: string;
  status: MatchStatus;
}
export interface DashboardTeamMemberDto {
  id: number;
  userId: number;
  teamId: number;
  isCaptain: boolean;
  joinedAt: string;
}
export interface DashboardTeamDto {
  id: number;
  name: string;
  inviteCode: string;
  isPublic: boolean;
  logoUrl: string | null;
  createdAt: string;
  memberCount: number;
  members: DashboardTeamMemberDto[];
}
export interface DashboardMatchDto {
  id: number;
  homeTeamId: number;
  awayTeamId: number;
  scheduledAt: string;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  place: {
    id: number | null;
    name: string | null;
    city: string | null;
  } | null;
  homeTeam?: Pick<DashboardTeamDto, 'id' | 'name' | 'logoUrl'>;
  awayTeam?: Pick<DashboardTeamDto, 'id' | 'name' | 'logoUrl'>;
}
export interface DashboardOverviewDto {
  stats: DashboardStatDto[];
  nextMatch: DashboardMatchSummaryDto | null;
  quickActions: DashboardQuickActionDto[];
  teamAvailability: TeamAvailabilityDto[];
  recentActivity: DashboardActivityDto[];
  weeklyLoad: WeeklyMatchLoadDto[];
  recommendedPlaces: RecommendedPlaceDto[];
  trainingFocus: TrainingFocusDto[];
  upcomingMatchesPreview: DashboardUpcomingMatchDto[];
  raw: {
    teams: DashboardTeamDto[];
    upcomingMatches: DashboardMatchDto[];
    previousMatches: DashboardMatchDto[];
    notifications: NotificationSummary[];
    places: RecommendedPlaceDto[];
  };
}
