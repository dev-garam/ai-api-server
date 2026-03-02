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

export class ChatStreamStartEventDto {
  @ApiProperty({ example: 'cm8msg-start' })
  messageId!: string;

  @ApiProperty({ example: 'cm8session' })
  sessionId!: string;
}

export class ChatStreamDeltaEventDto {
  @ApiProperty({ example: '안녕하세요 ' })
  text!: string;
}

export class ChatStreamEndEventDto {
  @ApiProperty({ example: 'cm8msg-assistant' })
  messageId!: string;

  @ApiProperty({ example: 'intent:weather.lookup | title:날씨 조회 | reasoning:...' })
  fullText!: string;

  @ApiProperty({ required: false, example: 'openai:gpt-4o-mini' })
  modelName?: string;
}
