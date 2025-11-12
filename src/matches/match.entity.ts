import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Team } from '../teams/team.entity';
import { MatchStatus } from './match-status.enum';

@Entity()
export class Match {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  homeTeamId: number;

  @Column()
  awayTeamId: number;

  @ManyToOne(() => Team, { eager: true })
  @JoinColumn({ name: 'homeTeamId' })
  homeTeam: Team;

  @ManyToOne(() => Team, { eager: true })
  @JoinColumn({ name: 'awayTeamId' })
  awayTeam: Team;

  @Column({ type: 'timestamp' })
  scheduledAt: Date;

  @Column({ length: 180 })
  location: string;

  @Column({ type: 'enum', enum: MatchStatus, default: MatchStatus.SCHEDULED })
  status: MatchStatus;

  @Column({ type: 'int', nullable: true })
  homeScore: number | null;

  @Column({ type: 'int', nullable: true })
  awayScore: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
