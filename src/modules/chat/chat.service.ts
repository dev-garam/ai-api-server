import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChatMessageRole } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { AgentServerService } from '../../shared/agent-server/agent-server.service';
import { AgentInStateChatMessage } from '../../shared/agent-server/agent-server.types';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import {
  ChatSessionResponseDto,
  CreateChatSessionRequestDto,
} from './dtos/create-chat-session.dto';
import {
  ChatMessageItemDto,
  ChatMessageListQueryDto,
  ChatMessageListResponseDto,
  SendChatMessageRequestDto,
  SendChatMessageResponseDto,
} from './dtos/chat-message.dto';

@Injectable()
export class ChatService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly agentServerService: AgentServerService,
  ) {}

  async createSession(
    authUser: AuthUser,
    dto: CreateChatSessionRequestDto,
  ): Promise<ChatSessionResponseDto> {
    const session = await this.prismaService.chatSession.create({
      data: {
        tenantId: authUser.tenantId,
        serviceId: authUser.serviceId,
        userId: authUser.userId,
        title: dto.title,
      },
    });

    return {
      id: session.id,
      tenantId: session.tenantId ?? undefined,
      userId: session.userId,
      title: session.title ?? undefined,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  async getSession(authUser: AuthUser, sessionId: string): Promise<ChatSessionResponseDto> {
    const session = await this.prismaService.chatSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.deletedAt !== null) {
      throw new NotFoundException('채팅 세션을 찾을 수 없습니다.');
    }
    this.assertSessionOwner(
      authUser,
      session.userId,
      session.tenantId ?? undefined,
      session.serviceId ?? undefined,
    );

    return {
      id: session.id,
      tenantId: session.tenantId ?? undefined,
      userId: session.userId,
      title: session.title ?? undefined,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  async listMessages(
    authUser: AuthUser,
    sessionId: string,
    query: ChatMessageListQueryDto,
  ): Promise<ChatMessageListResponseDto> {
    await this.ensureSessionOwner(authUser, sessionId);
    const limit = query.limit ?? 30;

    const messages = await this.prismaService.chatMessage.findMany({
      where: { sessionId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return {
      messages: messages.map((item) => this.toMessageDto(item)),
    };
  }

  async sendMessage(
    authUser: AuthUser,
    sessionId: string,
    dto: SendChatMessageRequestDto,
  ): Promise<SendChatMessageResponseDto> {
    await this.ensureSessionOwner(authUser, sessionId);

    const userMessage = await this.prismaService.chatMessage.create({
      data: {
        sessionId,
        role: ChatMessageRole.USER,
        content: dto.message,
      },
    });

    const assistantResult = await this.buildAssistantResponseFromIntent(sessionId);

    const assistantMessage = await this.prismaService.chatMessage.create({
      data: {
        sessionId,
        role: ChatMessageRole.ASSISTANT,
        content: assistantResult.answer,
        modelName: assistantResult.modelName,
      },
    });

    return {
      userMessage: this.toMessageDto(userMessage),
      assistantMessage: this.toMessageDto(assistantMessage),
    };
  }

  async sendMessageForStream(
    authUser: AuthUser,
    sessionId: string,
    dto: SendChatMessageRequestDto,
  ): Promise<SendChatMessageResponseDto> {
    return this.sendMessage(authUser, sessionId, dto);
  }

  tokenizeForStream(text: string): string[] {
    return text
      .split(/(\s+)/)
      .filter((chunk) => chunk.length > 0);
  }

  private async ensureSessionOwner(authUser: AuthUser, sessionId: string): Promise<void> {
    const session = await this.prismaService.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, tenantId: true, serviceId: true, deletedAt: true },
    });
    if (!session || session.deletedAt !== null) {
      throw new NotFoundException('채팅 세션을 찾을 수 없습니다.');
    }
    this.assertSessionOwner(
      authUser,
      session.userId,
      session.tenantId ?? undefined,
      session.serviceId ?? undefined,
    );
  }

  private assertSessionOwner(
    authUser: AuthUser,
    sessionUserId: string,
    sessionTenantId: string | undefined,
    sessionServiceId: string | undefined,
  ): void {
    if (authUser.userId !== sessionUserId) {
      throw new ForbiddenException('다른 사용자의 채팅 세션에는 접근할 수 없습니다.');
    }
    if ((authUser.tenantId ?? '') !== (sessionTenantId ?? '')) {
      throw new ForbiddenException('다른 테넌트의 채팅 세션에는 접근할 수 없습니다.');
    }
    if ((authUser.serviceId ?? '') !== (sessionServiceId ?? '')) {
      throw new ForbiddenException('다른 서비스의 채팅 세션에는 접근할 수 없습니다.');
    }
  }

  private toMessageDto(item: {
    id: string;
    sessionId: string;
    role: ChatMessageRole;
    content: string;
    modelName: string | null;
    createdAt: Date;
  }): ChatMessageItemDto {
    return {
      id: item.id,
      sessionId: item.sessionId,
      role: item.role,
      content: item.content,
      modelName: item.modelName ?? undefined,
      createdAt: item.createdAt.toISOString(),
    };
  }

  private async buildAssistantResponseFromIntent(
    sessionId: string,
  ): Promise<{ answer: string; modelName?: string }> {
    const recentMessages = await this.prismaService.chatMessage.findMany({
      where: { sessionId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    const stateMessages: AgentInStateChatMessage[] = recentMessages
      .map((item) => {
        if (item.role === ChatMessageRole.USER) {
          return { role: 'user', content: item.content };
        }
        if (item.role === ChatMessageRole.ASSISTANT) {
          return { role: 'assistant', content: item.content };
        }
        return null;
      })
      .filter((item): item is AgentInStateChatMessage => item !== null);

    const intent = await this.agentServerService.detectIntent({
      state: {
        messages: stateMessages,
      },
    });

    const featureId = intent.parsed.featureId;
    const featureTitle = intent.matchedFeature?.title ?? '알 수 없음';
    const reasoning = intent.parsed.reasoning ?? 'reasoning 없음';

    // Phase-1: intent detection 기반 임시 응답 포맷.
    const answer = `intent:${featureId} | title:${featureTitle} | reasoning:${reasoning}`;

    return {
      answer,
      modelName: 'intent-detect',
    };
  }
}
