export interface UserProfileDto {
  id: number;
  email: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  city: string | null;
  country: string | null;
  avatarUrl: string | null;
  isChatEnabled: boolean;
  isEmailVerified: boolean;
}
