import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { AuthServicePrincipal } from '../interfaces/auth-service.interface';
import { isLocalAuthBypassEnabled } from '../utils/local-auth.util';

interface HmacRequestShape {
  method: string;
  url: string;
  originalUrl?: string;
  body?: unknown;
  headers: Record<string, string | undefined>;
  serviceAuth?: AuthServicePrincipal;
}

@Injectable()
export class ServiceHmacGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<HmacRequestShape>();

    if (isLocalAuthBypassEnabled(this.configService)) {
      request.serviceAuth = {
        serviceId: request.headers['x-dev-service-id'] ?? 'local-service',
        serviceCode: request.headers['x-dev-service-code'] ?? 'local-service',
        keyId: 'local-auth-bypass',
      };
      return true;
    }

    const keyId = request.headers['x-key-id'];
    const timestamp = request.headers['x-timestamp'];
    const nonce = request.headers['x-nonce'];
    const signature = request.headers['x-signature'];

    if (!keyId || !timestamp || !nonce || !signature) {
      throw new UnauthorizedException('hmac_auth_headers_required');
    }

    const timestampSec = Number(timestamp);
    if (!Number.isInteger(timestampSec) || timestampSec <= 0) {
      throw new UnauthorizedException('invalid_timestamp');
    }

    const maxSkewSec = Number(this.configService.get<string>('HMAC_MAX_SKEW_SECONDS') ?? 60);
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - timestampSec) > maxSkewSec) {
      throw new UnauthorizedException('timestamp_expired');
    }

    const nonceKey = `auth:nonce:${keyId}:${nonce}`;
    const nonceAccepted = await this.redisService.setNxEx(nonceKey, maxSkewSec, '1');
    if (!nonceAccepted) {
      throw new UnauthorizedException('nonce_reused');
    }

    const credential = await this.prismaService.serviceCredential.findUnique({
      where: { keyId },
      include: { service: true },
    });
    if (!credential || credential.deletedAt !== null || credential.status !== 'ACTIVE') {
      throw new UnauthorizedException('key_not_active');
    }
    if (credential.service.deletedAt !== null) {
      throw new UnauthorizedException('service_not_active');
    }
    if (credential.expiresAt && credential.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('key_expired');
    }
    if (credential.service.status !== 'ACTIVE') {
      throw new UnauthorizedException('service_not_active');
    }

    const bodyString = JSON.stringify(request.body ?? {});
    const bodyHash = createHash('sha256').update(bodyString, 'utf8').digest('hex');
    const path = (request.originalUrl ?? request.url).split('?')[0];
    const signingString = `${request.method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
    const expected = createHmac('sha256', credential.secret).update(signingString, 'utf8').digest('hex');

    const receivedBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (receivedBuffer.length !== expectedBuffer.length) {
      throw new UnauthorizedException('invalid_signature');
    }
    if (!timingSafeEqual(receivedBuffer, expectedBuffer)) {
      throw new UnauthorizedException('invalid_signature');
    }

    request.serviceAuth = {
      serviceId: credential.serviceId,
      serviceCode: credential.service.code,
      keyId: credential.keyId,
    };

    await this.prismaService.serviceCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    });

    return true;
  }
}
