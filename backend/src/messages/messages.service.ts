import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { MqttService } from '../mqtt/mqtt.service';
import { conversationMessagesTopic } from '../mqtt/topics';

const DEFAULT_PAGE_SIZE = 50;

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationsService: ConversationsService,
    private readonly mqttService: MqttService,
  ) {}

  async create(conversationId: string, senderId: string, body: string) {
    await this.conversationsService.assertParticipant(conversationId, senderId);

    const message = await this.prisma.message.create({
      data: { conversationId, senderId, body },
    });

    this.mqttService
      .publish(conversationMessagesTopic(conversationId), message)
      .catch((err: Error) =>
        this.logger.error(
          `Failed to publish message ${message.id}: ${err.message}`,
        ),
      );

    return message;
  }

  async findForConversation(
    conversationId: string,
    userId: string,
    cursor?: string,
    limit: number = DEFAULT_PAGE_SIZE,
  ) {
    await this.conversationsService.assertParticipant(conversationId, userId);

    return this.prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
  }
}
