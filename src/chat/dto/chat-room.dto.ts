import { ChatRoomType } from '../chat-room-type.enum';

export interface ChatRoomDto {
  id: number;
  type: ChatRoomType;
  name: string;
  description: string | null;
  createdAt: Date;
  team?: {
    id: number;
    name: string;
  } | null;
  match?: {
    id: number;
    homeTeam: {
      id: number;
      name: string;
    };
    awayTeam: {
      id: number;
      name: string;
    };
    scheduledAt: Date;
  } | null;
}
