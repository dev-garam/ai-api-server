import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatMessageRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../shared/database/prisma.service';
import { AgentServerService } from '../../shared/agent-server/agent-server.service';
import {
  AgentGenerateReplyRequest,
  AgentInStateChatMessage,
  AgentStreamEvent,
} from '../../shared/agent-server/agent-server.types';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { isLocalAuthBypassEnabled } from '../../common/utils/local-auth.util';
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

interface LocalSessionRecord {
  id: string;
  userId: string;
  tenantId?: string;
  serviceId?: string;
  title?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface LocalMessageRecord {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  modelName?: string;
  createdAt: Date;
  deletedAt: Date | null;
}

interface PersistedUserMessage {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  createdAt: Date;
}

@Injectable()
export class ChatService {
  private readonly localSessions = new Map<string, LocalSessionRecord>();
  private readonly localMessages = new Map<string, LocalMessageRecord[]>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly agentServerService: AgentServerService,
  ) {}

  async createSession(
    authUser: AuthUser,
    dto: CreateChatSessionRequestDto,
  ): Promise<ChatSessionResponseDto> {
    if (this.shouldBypassPersistence(authUser)) {
      const now = new Date();
      const session: LocalSessionRecord = {
        id: randomUUID(),
        tenantId: authUser.tenantId,
        serviceId: authUser.serviceId,
        userId: authUser.userId,
        title: dto.title,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      this.localSessions.set(session.id, session);
      this.localMessages.set(session.id, []);
      return this.toSessionDto(session);
    }

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
    if (this.shouldBypassPersistence(authUser)) {
      const session = this.getLocalSessionOrThrow(sessionId);
      this.assertSessionOwner(
        authUser,
        session.userId,
        session.tenantId ?? undefined,
        session.serviceId ?? undefined,
      );
      return this.toSessionDto(session);
    }

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
    if (this.shouldBypassPersistence(authUser)) {
      await this.ensureLocalSessionOwner(authUser, sessionId);
      const limit = query.limit ?? 30;
      const messages = (this.localMessages.get(sessionId) ?? [])
        .filter((item) => item.deletedAt === null)
        .slice(-limit);
      return {
        messages: messages.map((item) => this.toMessageDto(item)),
      };
    }

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
    options?: { mockScenario?: string },
  ): Promise<SendChatMessageResponseDto> {
    if (this.shouldBypassPersistence(authUser)) {
      await this.ensureLocalSessionOwner(authUser, sessionId);
      const messages = this.localMessages.get(sessionId) ?? [];

      const userMessage: LocalMessageRecord = {
        id: randomUUID(),
        sessionId,
        role: ChatMessageRole.USER,
        content: dto.message,
        createdAt: new Date(),
        deletedAt: null,
      };
      messages.push(userMessage);

      const assistantResult = await this.buildAssistantResponseFromMessages(
        authUser,
        sessionId,
        messages,
        options,
      );

      const assistantMessage: LocalMessageRecord = {
        id: randomUUID(),
        sessionId,
        role: ChatMessageRole.ASSISTANT,
        content: assistantResult.answer,
        modelName: assistantResult.modelName,
        createdAt: new Date(),
        deletedAt: null,
      };
      messages.push(assistantMessage);

      const session = this.getLocalSessionOrThrow(sessionId);
      session.updatedAt = new Date();
      this.localMessages.set(sessionId, messages);

      return {
        userMessage: this.toMessageDto(userMessage),
        assistantMessage: this.toMessageDto(assistantMessage),
      };
    }

    await this.ensureSessionOwner(authUser, sessionId);

    const userMessage = await this.prismaService.chatMessage.create({
      data: {
        sessionId,
        role: ChatMessageRole.USER,
        content: dto.message,
      },
    });

    const assistantResult = await this.buildAssistantResponse(authUser, sessionId, options);

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
    options?: {
      signal?: AbortSignal;
      onEvent?: (event: AgentStreamEvent) => Promise<void> | void;
      mockScenario?: string;
    },
  ): Promise<void> {
    await this.createUserMessage(authUser, sessionId, dto.message);
    const messages = await this.getRecentMessagesForStream(authUser, sessionId);
    const payload = this.buildAgentPayload(authUser, sessionId, messages);

    let streamCompleted = false;
    let finalAnswer: string | undefined;
    let finalModelName: string | undefined;

    try {
      for await (const event of this.agentServerService.streamReply(payload, {
        signal: options?.signal,
        headers: this.buildAgentRequestHeaders(options?.mockScenario),
      })) {
        if (event.type === 'message.end') {
          finalAnswer = event.data.answer;
          finalModelName = event.data.modelName;
        }
        if (options?.onEvent) {
          await options.onEvent(event);
        }
        if (event.type === 'done') {
          streamCompleted = true;
        }
      }
    } catch (error) {
      if (options?.signal?.aborted) {
        return;
      }
      throw error;
    }

    if (!streamCompleted || !finalAnswer) {
      return;
    }

    await this.createAssistantMessage(authUser, sessionId, {
      answer: finalAnswer,
      modelName: finalModelName,
    });
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

  private async ensureLocalSessionOwner(authUser: AuthUser, sessionId: string): Promise<void> {
    const session = this.getLocalSessionOrThrow(sessionId);
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
    modelName?: string | null;
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

  private async buildAssistantResponse(
    authUser: AuthUser,
    sessionId: string,
    options?: { mockScenario?: string },
  ): Promise<{ answer: string; modelName?: string }> {
    const recentMessages = await this.prismaService.chatMessage.findMany({
      where: { sessionId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    return this.buildAssistantResponseFromMessages(authUser, sessionId, recentMessages, options);
  }

  private async buildAssistantResponseFromMessages(
    authUser: AuthUser,
    sessionId: string,
    messages: Array<{ id?: string; role: ChatMessageRole; content: string }>,
    options?: { mockScenario?: string },
  ): Promise<{ answer: string; modelName?: string }> {
    const payload = this.buildAgentPayload(authUser, sessionId, messages);

    const agentReply = await this.agentServerService.generateReply(payload, {
      headers: this.buildAgentRequestHeaders(options?.mockScenario),
    });

    return {
      answer: agentReply.answer,
      modelName: agentReply.modelName,
    };
  }

  private getLocalSessionOrThrow(sessionId: string): LocalSessionRecord {
    const session = this.localSessions.get(sessionId);
    if (!session || session.deletedAt !== null) {
      throw new NotFoundException('채팅 세션을 찾을 수 없습니다.');
    }
    return session;
  }

  private toSessionDto(session: LocalSessionRecord): ChatSessionResponseDto {
    return {
      id: session.id,
      tenantId: session.tenantId,
      userId: session.userId,
      title: session.title,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  private shouldBypassPersistence(authUser: AuthUser): boolean {
    return authUser.localDevToken === true && isLocalAuthBypassEnabled(this.configService);
  }

  private async createUserMessage(
    authUser: AuthUser,
    sessionId: string,
    message: string,
  ): Promise<PersistedUserMessage> {
    if (this.shouldBypassPersistence(authUser)) {
      await this.ensureLocalSessionOwner(authUser, sessionId);
      const localMessage: LocalMessageRecord = {
        id: randomUUID(),
        sessionId,
        role: ChatMessageRole.USER,
        content: message,
        createdAt: new Date(),
        deletedAt: null,
      };
      const messages = this.localMessages.get(sessionId) ?? [];
      messages.push(localMessage);
      this.localMessages.set(sessionId, messages);
      const session = this.getLocalSessionOrThrow(sessionId);
      session.updatedAt = new Date();
      return localMessage;
    }

    await this.ensureSessionOwner(authUser, sessionId);
    return this.prismaService.chatMessage.create({
      data: {
        sessionId,
        role: ChatMessageRole.USER,
        content: message,
      },
    });
  }

  private async createAssistantMessage(
    authUser: AuthUser,
    sessionId: string,
    payload: { answer: string; modelName?: string },
  ): Promise<void> {
    if (this.shouldBypassPersistence(authUser)) {
      const assistantMessage: LocalMessageRecord = {
        id: randomUUID(),
        sessionId,
        role: ChatMessageRole.ASSISTANT,
        content: payload.answer,
        modelName: payload.modelName,
        createdAt: new Date(),
        deletedAt: null,
      };
      const messages = this.localMessages.get(sessionId) ?? [];
      messages.push(assistantMessage);
      this.localMessages.set(sessionId, messages);
      const session = this.getLocalSessionOrThrow(sessionId);
      session.updatedAt = new Date();
      return;
    }

    await this.prismaService.chatMessage.create({
      data: {
        sessionId,
        role: ChatMessageRole.ASSISTANT,
        content: payload.answer,
        modelName: payload.modelName,
      },
    });
  }

  private async getRecentMessagesForStream(
    authUser: AuthUser,
    sessionId: string,
  ): Promise<Array<{ id?: string; role: ChatMessageRole; content: string }>> {
    if (this.shouldBypassPersistence(authUser)) {
      await this.ensureLocalSessionOwner(authUser, sessionId);
      return [...(this.localMessages.get(sessionId) ?? [])];
    }

    await this.ensureSessionOwner(authUser, sessionId);
    return this.prismaService.chatMessage.findMany({
      where: { sessionId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
  }

  private buildAgentPayload(
    authUser: AuthUser,
    sessionId: string,
    messages: Array<{ id?: string; role: ChatMessageRole; content: string }>,
  ): AgentGenerateReplyRequest {
    const recentMessages = messages.slice(-20);
    const lastUserMessage = [...recentMessages]
      .reverse()
      .find((message) => message.role === ChatMessageRole.USER);
    const requestId = randomUUID();

    return {
      model: this.getAgentModel(),
      session: {
        id: sessionId,
        userId: authUser.userId,
        tenantId: authUser.tenantId ?? '',
        serviceId: authUser.serviceId ?? '',
      },
      state: {
        messages: this.toAgentStateMessages(recentMessages),
        viewerTimezone: this.getViewerTimezone(),
        userMemory: [],
      },
      context: {
        conversationSummary: '',
        sessionVersion: messages.length,
        requestId,
        chatMessageId: lastUserMessage?.id,
      },
    };
  }

  private toAgentStateMessages(
    messages: Array<{ role: ChatMessageRole; content: string }>,
  ): AgentInStateChatMessage[] {
    return messages
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
  }

  private getViewerTimezone(): string | undefined {
    return this.configService.get<string>('TZ') ?? 'Asia/Seoul';
  }

  private getAgentModel(): string {
    return (
      this.configService.get<string>('AGENT_DEFAULT_MODEL') ??
      'google-genai:gemini-2.5-flash-lite'
    );
  }

  private buildAgentRequestHeaders(mockScenario?: string): Record<string, string> | undefined {
    if (!mockScenario || mockScenario.trim().length === 0) {
      return undefined;
    }
    return {
      'x-agent-mock-scenario': mockScenario.trim(),
    };
  }
}
