import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './users/user.entity';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { Team } from './teams/team.entity';
import { TeamMember } from './teams/team-member.entity';
import { TeamsModule } from './teams/teams.module';
import { Match } from './matches/match.entity';
import { MatchesModule } from './matches/matches.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        entities: [User, Team, TeamMember, Match],
        synchronize: true, // DEV UNIQUEMENT
      }),
    }),
    UsersModule,
    AuthModule,
    TeamsModule,
    MatchesModule,
  ],
})
export class AppModule {}
