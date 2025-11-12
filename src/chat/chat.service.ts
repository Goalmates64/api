import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { ChatRoom } from './chat-room.entity';
import { ChatMessage } from './chat-message.entity';
import { ChatRoomType } from './chat-room-type.enum';
import { ChatRoomDto } from './dto/chat-room.dto';
import { ChatMessageDto, ChatMessagesResponse } from './dto/chat-message.dto';
import { ChatGateway } from './chat.gateway';
import { SendMessageDto } from './dto/send-message.dto';
import { TeamMember } from '../teams/team-member.entity';
import { Match } from '../matches/match.entity';
import { User } from '../users/user.entity';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(ChatRoom)
    private readonly roomRepo: Repository<ChatRoom>,
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(TeamMember)
    private readonly memberRepo: Repository<TeamMember>,
    @InjectRepository(Match)
    private readonly matchRepo: Repository<Match>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly chatGateway: ChatGateway,
  ) {}

  async listRooms(userId: number): Promise<ChatRoomDto[]> {
    await this.ensureChatEnabled(userId);

    const memberships = await this.memberRepo.find({
      where: { userId },
      relations: ['team'],
      order: { joinedAt: 'ASC' },
    });

    const [globalRoom, teamRooms, matchRooms] = await Promise.all([
      this.ensureGlobalRoom(),
      this.loadTeamRooms(memberships),
      this.loadMatchRooms(memberships),
    ]);

    const rooms = [globalRoom, ...teamRooms, ...matchRooms];
    const unique = new Map<number, ChatRoom>();
    rooms.forEach((room) => unique.set(room.id, room));

    return Array.from(unique.values())
      .sort((a, b) => this.sortRooms(a, b))
      .map((room) => this.toRoomDto(room));
  }

  async getMessages(
    userId: number,
    roomId: number,
    beforeId?: number,
  ): Promise<ChatMessagesResponse> {
    await this.ensureChatEnabled(userId);
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Salon introuvable');
    }
    await this.ensureUserAccess(userId, room);

    const limit = 50;
    const qb = this.messageRepo
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.sender', 'sender')
      .where('message.roomId = :roomId', { roomId })
      .orderBy('message.id', 'DESC')
      .take(limit + 1);

    if (beforeId) {
      qb.andWhere('message.id < :beforeId', { beforeId });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const ordered = trimmed.reverse();

    return {
      messages: ordered.map((message) => this.toMessageDto(message)),
      nextCursor: hasMore ? (ordered[0]?.id ?? null) : null,
    };
  }

  async sendMessage(
    userId: number,
    roomId: number,
    dto: SendMessageDto,
  ): Promise<ChatMessageDto> {
    const user = await this.ensureChatEnabled(userId);
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Salon introuvable');
    }
    await this.ensureUserAccess(userId, room);

    const trimmed = dto.content?.trim();
    if (!trimmed) {
      throw new BadRequestException('Ton message est vide.');
    }

    const message = this.messageRepo.create({
      roomId: room.id,
      senderId: user.id,
      content: trimmed,
    });
    const saved = await this.messageRepo.save(message);
    this.logger.log(
      `User ${user.id} posted message #${saved.id} in room ${room.id}`,
    );
    const fullMessage = await this.messageRepo.findOne({
      where: { id: saved.id },
      relations: ['sender'],
    });

    if (!fullMessage) {
      throw new NotFoundException('Message introuvable');
    }

    const dtoMessage = this.toMessageDto(fullMessage);
    const recipientIds = await this.resolveRecipients(room);

    if (room.type === ChatRoomType.GLOBAL) {
      this.chatGateway.emitMessageToAll(dtoMessage);
    } else {
      this.chatGateway.emitMessageToUsers(recipientIds, dtoMessage);
    }

    return dtoMessage;
  }

  private async loadTeamRooms(memberships: TeamMember[]) {
    const rooms: ChatRoom[] = [];
    for (const membership of memberships) {
      if (!membership.team) {
        continue;
      }
      const room = await this.ensureTeamRoom(
        membership.team.id,
        membership.team.name,
      );
      room.team = membership.team;
      rooms.push(room);
    }
    return rooms;
  }

  private async loadMatchRooms(memberships: TeamMember[]) {
    const teamIds = memberships.map((member) => member.teamId);
    if (!teamIds.length) {
      return [];
    }

    const matches = await this.matchRepo.find({
      where: [{ homeTeamId: In(teamIds) }, { awayTeamId: In(teamIds) }],
      relations: { homeTeam: true, awayTeam: true },
      order: { scheduledAt: 'DESC' },
      take: 20,
    });

    const rooms: ChatRoom[] = [];
    for (const match of matches) {
      const room = await this.ensureMatchRoom(match);
      room.match = match;
      rooms.push(room);
    }
    return rooms;
  }

  private async ensureGlobalRoom(): Promise<ChatRoom> {
    let room = await this.roomRepo.findOne({
      where: { type: ChatRoomType.GLOBAL },
    });
    if (!room) {
      room = this.roomRepo.create({
        type: ChatRoomType.GLOBAL,
        name: 'Agora GoalMates',
        description: 'Discute avec toute la communaute GoalMates.',
      });
      room = await this.roomRepo.save(room);
    }
    return room;
  }

  private async ensureTeamRoom(
    teamId: number,
    teamName?: string,
  ): Promise<ChatRoom> {
    let room = await this.roomRepo.findOne({
      where: { type: ChatRoomType.TEAM, teamId },
    });
    const desiredName = teamName
      ? `${teamName} - Salon d'equipe`
      : "Salon d'equipe";
    if (!room) {
      room = this.roomRepo.create({
        type: ChatRoomType.TEAM,
        teamId,
        name: desiredName,
        description:
          'Organise les entrainements et reste en phase avec tes coequipiers.',
      });
      room = await this.roomRepo.save(room);
    } else if (teamName && room.name !== desiredName) {
      room.name = desiredName;
      room = await this.roomRepo.save(room);
    }
    return room;
  }

  private async ensureMatchRoom(match: Match): Promise<ChatRoom> {
    let room = await this.roomRepo.findOne({
      where: { type: ChatRoomType.MATCH, matchId: match.id },
    });
    const label = `${match.homeTeam?.name ?? 'Equipe A'} vs ${match.awayTeam?.name ?? 'Equipe B'}`;
    if (!room) {
      room = this.roomRepo.create({
        type: ChatRoomType.MATCH,
        matchId: match.id,
        name: `Match - ${label}`,
        description:
          'Coordonne-toi avec les deux equipes avant et apres la rencontre.',
      });
      room = await this.roomRepo.save(room);
    }
    return room;
  }

  private toRoomDto(room: ChatRoom): ChatRoomDto {
    return {
      id: room.id,
      type: room.type,
      name: room.name,
      description: room.description,
      createdAt: room.createdAt,
      team: room.team
        ? {
            id: room.team.id,
            name: room.team.name,
          }
        : null,
      match: room.match
        ? {
            id: room.match.id,
            homeTeam: {
              id: room.match.homeTeam?.id ?? room.match.homeTeamId,
              name: room.match.homeTeam?.name ?? 'Equipe A',
            },
            awayTeam: {
              id: room.match.awayTeam?.id ?? room.match.awayTeamId,
              name: room.match.awayTeam?.name ?? 'Equipe B',
            },
            scheduledAt: room.match.scheduledAt,
          }
        : null,
    };
  }

  private toMessageDto(message: ChatMessage): ChatMessageDto {
    return {
      id: message.id,
      roomId: message.roomId,
      content: message.content,
      createdAt: message.createdAt,
      sender: {
        id: message.senderId,
        username: message.sender?.username ?? 'GoalMates',
        avatarUrl: message.sender?.avatarUrl ?? null,
      },
    };
  }

  private sortRooms(a: ChatRoom, b: ChatRoom) {
    if (a.type === ChatRoomType.GLOBAL) {
      return -1;
    }
    if (b.type === ChatRoomType.GLOBAL) {
      return 1;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  }

  private async ensureUserAccess(userId: number, room: ChatRoom) {
    if (room.type === ChatRoomType.GLOBAL) {
      return;
    }

    if (room.type === ChatRoomType.TEAM && room.teamId) {
      const membership = await this.memberRepo.findOne({
        where: { userId, teamId: room.teamId },
      });
      if (!membership) {
        throw new ForbiddenException("Tu n'as pas acces a ce salon d'equipe.");
      }
      return;
    }

    if (room.type === ChatRoomType.MATCH && room.matchId) {
      const match = await this.matchRepo.findOne({
        where: { id: room.matchId },
      });
      if (!match) {
        throw new NotFoundException('Match introuvable.');
      }
      const memberships = await this.memberRepo.count({
        where: { userId, teamId: In([match.homeTeamId, match.awayTeamId]) },
      });
      if (!memberships) {
        throw new ForbiddenException("Tu n'es pas joueur de ce match.");
      }
      return;
    }

    throw new ForbiddenException("Tu n'as pas acces a ce salon.");
  }

  private async ensureChatEnabled(userId: number): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    if (!user.isChatEnabled) {
      throw new ForbiddenException(
        'Le chat est desactive pour ton profil. Active-le dans tes parametres.',
      );
    }
    return user;
  }

  private async resolveRecipients(room: ChatRoom): Promise<number[]> {
    if (room.type === ChatRoomType.GLOBAL) {
      return [];
    }

    if (room.type === ChatRoomType.TEAM && room.teamId) {
      const members = await this.memberRepo.find({
        where: { teamId: room.teamId },
        select: ['userId'],
      });
      return Array.from(new Set(members.map((member) => member.userId)));
    }

    if (room.type === ChatRoomType.MATCH && room.matchId) {
      const match = await this.matchRepo.findOne({
        where: { id: room.matchId },
      });
      if (!match) {
        return [];
      }
      const members = await this.memberRepo.find({
        where: { teamId: In([match.homeTeamId, match.awayTeamId]) },
        select: ['userId'],
      });
      return Array.from(new Set(members.map((member) => member.userId)));
    }

    return [];
  }
}
