import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class IssueUserTicketRequestDto {
  @ApiProperty({ example: 'user-123' })
  @IsString()
  @MinLength(1)
  userId!: string;

  @ApiPropertyOptional({ example: 'tenant-a' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ type: [String], example: ['chat:read', 'chat:write'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];
}

export class TokenPairResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ example: 900 })
  accessExpiresInSec!: number;

  @ApiProperty({ example: 604800 })
  refreshExpiresInSec!: number;
}
