import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TeamMember } from '../teams/team-member.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ unique: true })
  username: string;

  @Column()
  passwordHash: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  lastName: string | null;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  avatarPath: string | null;

  @Column({ default: true })
  isChatEnabled: boolean;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ type: 'datetime', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  emailVerificationTokenHash: string | null;

  @Column({ type: 'datetime', nullable: true })
  emailVerificationTokenExpiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => TeamMember, (member) => member.user)
  teamMemberships: TeamMember[];
}
