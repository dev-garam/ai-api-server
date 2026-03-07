import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class SendChatMessageRequestDto {
  @ApiProperty({ example: '오늘 일정 알려줘.' })
  @IsString()
  @MinLength(1)
  message!: string;
}

export class ChatMessageItemDto {
  @ApiProperty({ example: 'cm8msg...' })
  id!: string;

  @ApiProperty({ example: 'cm8session...' })
  sessionId!: string;

  @ApiProperty({ example: 'USER', enum: ['USER', 'ASSISTANT', 'SYSTEM'] })
  role!: 'USER' | 'ASSISTANT' | 'SYSTEM';

  @ApiProperty({ example: '오늘 일정 알려줘.' })
  content!: string;

  @ApiPropertyOptional({ example: 'gpt-4.1-mini' })
  modelName?: string;

  @ApiProperty({ example: '2026-03-02T12:30:00.000Z' })
  createdAt!: string;
}

export class SendChatMessageResponseDto {
  @ApiProperty({ type: ChatMessageItemDto })
  userMessage!: ChatMessageItemDto;

  @ApiProperty({ type: ChatMessageItemDto })
  assistantMessage!: ChatMessageItemDto;
}

export class ChatMessageListQueryDto {
  @ApiPropertyOptional({ example: 30, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;
}

export class ChatMessageListResponseDto {
  @ApiProperty({ type: [ChatMessageItemDto] })
  messages!: ChatMessageItemDto[];
}

export class ChatStreamEventDto {
  @ApiProperty({
    example: 'message.delta',
    enum: ['message.start', 'message.delta', 'message.end', 'intent.result', 'intent.error', 'done', 'error'],
  })
  type!:
    | 'message.start'
    | 'message.delta'
    | 'message.end'
    | 'intent.result'
    | 'intent.error'
    | 'done'
    | 'error';

  @ApiProperty({
    example: { text: '안녕하세요' },
    description: '이벤트별 payload. upstream agent event 형식을 그대로 전달합니다.',
    additionalProperties: true,
  })
  data!: Record<string, unknown>;
}
