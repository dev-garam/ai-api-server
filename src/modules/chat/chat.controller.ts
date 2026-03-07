import { Body, Controller, Get, Headers, Param, Post, Query, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiProduces,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ChatService } from './chat.service';
import { GetAuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import {
  ChatSessionResponseDto,
  CreateChatSessionRequestDto,
} from './dtos/create-chat-session.dto';
import {
  ChatMessageListQueryDto,
  ChatMessageListResponseDto,
  ChatStreamEventDto,
  SendChatMessageRequestDto,
  SendChatMessageResponseDto,
} from './dtos/chat-message.dto';

@Controller({
  path: 'chat',
  version: '1',
})
@ApiTags('채팅 세션')
@ApiBearerAuth('access-token')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('sessions')
  @ApiOperation({ summary: '채팅 세션 생성' })
  @ApiResponse({ status: 201, type: ChatSessionResponseDto })
  createSession(
    @GetAuthUser() authUser: AuthUser,
    @Body() dto: CreateChatSessionRequestDto,
  ): Promise<ChatSessionResponseDto> {
    return this.chatService.createSession(authUser, dto);
  }

  @Get('sessions/:sessionId')
  @ApiOperation({ summary: '채팅 세션 조회' })
  @ApiParam({ name: 'sessionId', description: '채팅 세션 ID' })
  @ApiResponse({ status: 200, type: ChatSessionResponseDto })
  getSession(
    @GetAuthUser() authUser: AuthUser,
    @Param('sessionId') sessionId: string,
  ): Promise<ChatSessionResponseDto> {
    return this.chatService.getSession(authUser, sessionId);
  }

  @Get('sessions/:sessionId/messages')
  @ApiOperation({ summary: '채팅 메시지 목록 조회' })
  @ApiParam({ name: 'sessionId', description: '채팅 세션 ID' })
  @ApiResponse({ status: 200, type: ChatMessageListResponseDto })
  listMessages(
    @GetAuthUser() authUser: AuthUser,
    @Param('sessionId') sessionId: string,
    @Query() query: ChatMessageListQueryDto,
  ): Promise<ChatMessageListResponseDto> {
    return this.chatService.listMessages(authUser, sessionId, query);
  }

  @Post('sessions/:sessionId/messages')
  @ApiOperation({ summary: '채팅 메시지 전송 및 답변 수신 (agent-server 브릿지)' })
  @ApiParam({ name: 'sessionId', description: '채팅 세션 ID' })
  @ApiResponse({ status: 201, type: SendChatMessageResponseDto })
  sendMessage(
    @GetAuthUser() authUser: AuthUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: SendChatMessageRequestDto,
    @Headers('x-agent-mock-scenario') mockScenario?: string,
  ): Promise<SendChatMessageResponseDto> {
    return this.chatService.sendMessage(authUser, sessionId, dto, { mockScenario });
  }

  @Post('sessions/:sessionId/messages/stream')
  @ApiOperation({ summary: '채팅 메시지 전송 및 SSE 응답 스트리밍' })
  @ApiParam({ name: 'sessionId', description: '채팅 세션 ID' })
  @ApiConsumes('application/json')
  @ApiProduces('text/event-stream')
  @ApiResponse({
    status: 201,
    description:
      'SSE 이벤트(message.start, message.delta, message.end, intent.result, done, error)를 upstream에서 받아 그대로 전송합니다.',
    type: ChatStreamEventDto,
  })
  async streamMessage(
    @GetAuthUser() authUser: AuthUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: SendChatMessageRequestDto,
    @Headers('x-agent-mock-scenario') mockScenario: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const abortController = new AbortController();
    const abortUpstream = (): void => {
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
    };

    response.status(201);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    response.on('close', abortUpstream);
    response.on('finish', abortUpstream);

    try {
      await this.chatService.sendMessageForStream(authUser, sessionId, dto, {
        signal: abortController.signal,
        mockScenario,
        onEvent: (event) => {
          response.write(`event: ${event.type}\n`);
          response.write(`data: ${JSON.stringify(event.data)}\n\n`);
        },
      });
    } finally {
      response.off('close', abortUpstream);
      response.off('finish', abortUpstream);
      if (!response.writableEnded) {
        response.end();
      }
    }
  }
}
