import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TeamMember } from './team-member.entity';

@Entity()
@Unique(['name'])
@Unique(['inviteCode'])
export class Team {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 16 })
  inviteCode: string;

  @Column({ default: false })
  isPublic: boolean;

  @Column({ type: 'varchar', length: 512, nullable: true })
  logoUrl: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  logoPath: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => TeamMember, (member) => member.team, {
    cascade: true,
  })
  members: TeamMember[];
}
