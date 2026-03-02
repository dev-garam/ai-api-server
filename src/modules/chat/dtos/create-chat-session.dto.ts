import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateChatSessionRequestDto {
  @ApiPropertyOptional({ example: '첫 상담 세션' })
  @IsOptional()
  @IsString()
  title?: string;
}

export class ChatSessionResponseDto {
  @ApiProperty({ example: 'cm8xyz...' })
  id!: string;

  @ApiPropertyOptional({ example: 'tenant-a' })
  tenantId?: string;

  @ApiProperty({ example: 'user-123' })
  userId!: string;

  @ApiPropertyOptional({ example: '첫 상담 세션' })
  title?: string;

  @ApiProperty({ example: '2026-03-02T12:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-03-02T12:30:00.000Z' })
  updatedAt!: string;
}
