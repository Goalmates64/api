import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { Match } from '../match.entity';
import { User } from '../../users/user.entity';
import { MatchAttendanceStatus } from './match-attendance-status.enum';

@Entity()
@Unique(['matchId', 'userId'])
export class MatchAttendance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  matchId: number;

  @Column()
  userId: number;

  @Column({ type: 'enum', enum: MatchAttendanceStatus })
  status: MatchAttendanceStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  respondedAt: Date | null;

  @ManyToOne(() => Match, (match) => match.attendances, {
    onDelete: 'CASCADE',
  })
  match: Match;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;
}
