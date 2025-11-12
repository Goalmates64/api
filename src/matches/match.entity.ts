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
import { Place } from '../places/place.entity';

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

  @Column({ nullable: true })
  placeId: number | null;

  @ManyToOne(() => Place, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'placeId' })
  place: Place | null;

  @Column({ type: 'enum', enum: MatchStatus, default: MatchStatus.SCHEDULED })
  status: MatchStatus;

  @Column({ type: 'int', nullable: true })
  homeScore: number | null;

  @Column({ type: 'int', nullable: true })
  awayScore: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
