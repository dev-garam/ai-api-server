import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { sign, verify } from 'jsonwebtoken';
import { RedisService } from '../../shared/redis/redis.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuthServicePrincipal } from '../../common/interfaces/auth-service.interface';
import { IssueUserTicketRequestDto, TokenPairResponseDto } from './dtos/issue-user-ticket.dto';
import {
  ServiceTokenIssueRequestDto,
  ServiceTokenIssueResponseDto,
} from './dtos/service-token.dto';

interface RefreshTokenPayload {
  sub: string;
  tenantId?: string;
  serviceId?: string;
  scopes?: string[];
  tokenType: 'refresh';
  jti: string;
  iat: number;
  exp: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly prismaService: PrismaService,
  ) {}

  async issueUserTicket(dto: IssueUserTicketRequestDto): Promise<TokenPairResponseDto> {
    return this.createTokenPair(dto.userId, dto.tenantId, dto.scopes ?? []);
  }

  async issueServiceUserToken(
    serviceAuth: AuthServicePrincipal,
    dto: ServiceTokenIssueRequestDto,
  ): Promise<ServiceTokenIssueResponseDto> {
    const identity = await this.findOrCreateIdentity(serviceAuth, dto);
    const tokenPair = await this.createTokenPair(
      identity.userId,
      dto.tenantId ?? identity.tenantId ?? undefined,
      dto.scopes ?? [],
      serviceAuth.serviceId,
    );

    return {
      ...tokenPair,
      user: {
        userId: identity.userId,
        externalUserId: identity.externalUserId,
        tenantId: dto.tenantId ?? identity.tenantId ?? undefined,
      },
    };
  }

  async refresh(refreshToken: string): Promise<TokenPairResponseDto> {
    const secret = this.getJwtSecret();
    const decoded = verify(refreshToken, secret);
    if (!this.isRefreshPayload(decoded)) {
      throw new UnauthorizedException('유효하지 않은 refresh token입니다.');
    }

    const key = this.getRefreshStoreKey(decoded.jti);
    const stored = await this.redisService.get(key);
    if (!stored) {
      throw new UnauthorizedException('만료되었거나 폐기된 refresh token입니다.');
    }

    await this.redisService.del(key);
    return this.createTokenPair(
      decoded.sub,
      decoded.tenantId,
      decoded.scopes ?? [],
      decoded.serviceId,
    );
  }

  private async createTokenPair(
    userId: string,
    tenantId: string | undefined,
    scopes: string[],
    serviceId?: string,
  ): Promise<TokenPairResponseDto> {
    const secret = this.getJwtSecret();
    const issuer = this.configService.get<string>('JWT_ISSUER') ?? 'ai-api-server';
    const accessExpiresInSec = this.parseDurationToSeconds(
      this.configService.get<string>('ACCESS_TOKEN_EXPIRES_IN') ??
        this.configService.get<string>('JWT_EXPIRES_IN') ??
        '15m',
    );
    const refreshExpiresInSec = this.parseDurationToSeconds(
      this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN') ?? '7d',
    );
    const refreshJti = randomUUID();

    const accessToken = sign(
      {
        sub: userId,
        tenantId,
        serviceId,
        scopes,
        tokenType: 'access',
        jti: randomUUID(),
      },
      secret,
      {
        issuer,
        expiresIn: accessExpiresInSec,
      },
    );

    const refreshToken = sign(
      {
        sub: userId,
        tenantId,
        serviceId,
        scopes,
        tokenType: 'refresh',
        jti: refreshJti,
      },
      secret,
      {
        issuer,
        expiresIn: refreshExpiresInSec,
      },
    );

    await this.redisService.setEx(
      this.getRefreshStoreKey(refreshJti),
      refreshExpiresInSec,
      JSON.stringify({ userId, tenantId, scopes, serviceId }),
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      accessExpiresInSec,
      refreshExpiresInSec,
    };
  }

  private getJwtSecret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new UnauthorizedException('JWT_SECRET이 설정되지 않았습니다.');
    }
    return secret;
  }

  private getRefreshStoreKey(jti: string): string {
    return `auth:refresh:${jti}`;
  }

  private async findOrCreateIdentity(
    serviceAuth: AuthServicePrincipal,
    dto: ServiceTokenIssueRequestDto,
  ): Promise<{ userId: string; externalUserId: string; tenantId?: string | null }> {
    const existing = await this.prismaService.userIdentity.findUnique({
      where: {
        serviceId_externalUserId: {
          serviceId: serviceAuth.serviceId,
          externalUserId: dto.externalUserId,
        },
      },
    });
    if (existing) {
      if (existing.deletedAt !== null) {
        const restoredUser = await this.prismaService.user.upsert({
          where: { id: existing.userId },
          update: {
            deletedAt: null,
            displayName: dto.displayName,
          },
          create: {
            id: existing.userId,
            displayName: dto.displayName,
          },
        });
        const restoredIdentity = await this.prismaService.userIdentity.update({
          where: { id: existing.id },
          data: {
            deletedAt: null,
            tenantId: dto.tenantId ?? existing.tenantId,
          },
        });
        return {
          userId: restoredUser.id,
          externalUserId: restoredIdentity.externalUserId,
          tenantId: restoredIdentity.tenantId,
        };
      }

      if (dto.displayName && dto.displayName.length > 0) {
        await this.prismaService.user.update({
          where: { id: existing.userId },
          data: { displayName: dto.displayName, deletedAt: null },
        });
      }
      if (dto.tenantId && dto.tenantId !== existing.tenantId) {
        const updated = await this.prismaService.userIdentity.update({
          where: { id: existing.id },
          data: { tenantId: dto.tenantId },
        });
        return updated;
      }
      return existing;
    }

    const created = await this.prismaService.user.create({
      data: {
        displayName: dto.displayName,
        identities: {
          create: {
            serviceId: serviceAuth.serviceId,
            externalUserId: dto.externalUserId,
            tenantId: dto.tenantId,
          },
        },
      },
      include: {
        identities: true,
      },
    });

    const identity = created.identities[0];
    return {
      userId: identity.userId,
      externalUserId: identity.externalUserId,
      tenantId: identity.tenantId,
    };
  }

  private isRefreshPayload(payload: unknown): payload is RefreshTokenPayload {
    if (typeof payload !== 'object' || payload === null) {
      return false;
    }
    const candidate = payload as Partial<RefreshTokenPayload>;
    return (
      typeof candidate.sub === 'string' &&
      typeof candidate.jti === 'string' &&
      candidate.tokenType === 'refresh' &&
      typeof candidate.iat === 'number' &&
      typeof candidate.exp === 'number'
    );
  }

  private parseDurationToSeconds(raw: string): number {
    const normalized = raw.trim();
    const match = normalized.match(/^(\d+)([smhd])$/i);
    if (!match) {
      const numeric = Number(normalized);
      if (Number.isInteger(numeric) && numeric > 0) {
        return numeric;
      }
      throw new UnauthorizedException(`유효하지 않은 토큰 만료 설정값입니다: ${raw}`);
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 's') return value;
    if (unit === 'm') return value * 60;
    if (unit === 'h') return value * 3600;
    return value * 86400;
  }
}
