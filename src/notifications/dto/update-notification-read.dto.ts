import { IsBoolean } from 'class-validator';

export class UpdateNotificationReadDto {
  @IsBoolean()
  isRead: boolean;
}
