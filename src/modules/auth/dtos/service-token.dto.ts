import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class ServiceTokenIssueRequestDto {
  @ApiProperty({ example: 'ext-user-123' })
  @IsString()
  @MinLength(1)
  externalUserId!: string;

  @ApiPropertyOptional({ example: 'tenant-a' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ example: '홍길동' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ type: [String], example: ['chat:read', 'chat:write'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];
}

export class ServiceIssuedUserDto {
  @ApiProperty({ example: 'usr_abc123' })
  userId!: string;

  @ApiProperty({ example: 'ext-user-123' })
  externalUserId!: string;

  @ApiPropertyOptional({ example: 'tenant-a' })
  tenantId?: string;
}

export class ServiceTokenIssueResponseDto {
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

  @ApiProperty({ type: ServiceIssuedUserDto })
  user!: ServiceIssuedUserDto;
}
