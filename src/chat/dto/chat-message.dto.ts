export interface ChatMessageDto {
  id: number;
  roomId: number;
  content: string;
  createdAt: Date;
  sender: {
    id: number;
    username: string;
    avatarUrl: string | null;
  };
}

export interface ChatMessagesResponse {
  messages: ChatMessageDto[];
  nextCursor: number | null;
}
