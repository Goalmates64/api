import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ChatRoomType } from './chat-room-type.enum';
import { Team } from '../teams/team.entity';
import { Match } from '../matches/match.entity';
import { ChatMessage } from './chat-message.entity';

@Entity()
@Unique('UQ_chat_room_team', ['teamId'])
@Unique('UQ_chat_room_match', ['matchId'])
export class ChatRoom {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: ChatRoomType })
  type: ChatRoomType;

  @Column({ type: 'int', nullable: true })
  teamId: number | null;

  @Column({ type: 'int', nullable: true })
  matchId: number | null;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  description: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @ManyToOne(() => Team, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'teamId' })
  team: Team | null;

  @ManyToOne(() => Match, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'matchId' })
  match: Match | null;

  @OneToMany(() => ChatMessage, (message) => message.room)
  messages: ChatMessage[];
}
