import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';

const CONVERSATION_INCLUDE = {
  participants: {
    include: {
      user: { select: { id: true, displayName: true, email: true } },
    },
  },
};

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createConversation(creatorId: string, dto: CreateConversationDto) {
    const participantIds = Array.from(
      new Set([creatorId, ...dto.participantIds]),
    );

    if (participantIds.length < 2) {
      throw new BadRequestException(
        'A conversation needs at least one other participant',
      );
    }

    const isGroup = dto.isGroup ?? participantIds.length > 2;

    if (!isGroup) {
      const [userA, userB] = participantIds;
      const existing = await this.prisma.conversation.findFirst({
        where: {
          isGroup: false,
          participants: { some: { userId: userA } },
          AND: { participants: { some: { userId: userB } } },
        },
      });
      if (existing) {
        return this.findOneForUser(existing.id, creatorId);
      }
    }

    return this.prisma.conversation.create({
      data: {
        isGroup,
        name: isGroup ? dto.name : undefined,
        participants: {
          create: participantIds.map((userId) => ({ userId })),
        },
      },
      include: CONVERSATION_INCLUDE,
    });
  }

  async findForUser(userId: string) {
    return this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      include: {
        ...CONVERSATION_INCLUDE,
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOneForUser(conversationId: string, userId: string) {
    await this.assertParticipant(conversationId, userId);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: CONVERSATION_INCLUDE,
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  async assertParticipant(conversationId: string, userId: string) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!participant) {
      throw new ForbiddenException('Not a participant of this conversation');
    }

    return participant;
  }
}
