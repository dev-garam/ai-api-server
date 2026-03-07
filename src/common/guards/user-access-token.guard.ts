import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { verify } from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthUser } from '../interfaces/auth-user.interface';
import { isLocalAuthBypassEnabled } from '../utils/local-auth.util';

interface AccessTokenPayload {
  sub: string;
  tenantId?: string;
  serviceId?: string;
  scopes?: string[];
  tokenType: 'access' | 'refresh';
  jti: string;
  localDevToken?: boolean;
  iat: number;
  exp: number;
}

@Injectable()
export class UserAccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
    }>();

    const authorization = request.headers.authorization;
    if (!authorization) {
      if (isLocalAuthBypassEnabled(this.configService)) {
        request.user = {
          userId: request.headers['x-dev-user-id'] ?? 'local-user',
          tenantId: request.headers['x-dev-tenant-id'],
          serviceId: request.headers['x-dev-service-id'],
          scopes: this.parseDevScopes(request.headers['x-dev-scopes']),
          tokenType: 'access',
          jti: 'local-auth-bypass',
          localDevToken: false,
        };
        return true;
      }
      throw new UnauthorizedException('Authorization 헤더가 필요합니다.');
    }

    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Bearer 토큰 형식이 올바르지 않습니다.');
    }

    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new UnauthorizedException('JWT_SECRET이 설정되지 않았습니다.');
    }

    const decoded = verify(token, secret);
    if (!this.isAccessTokenPayload(decoded)) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }
    if (decoded.tokenType !== 'access') {
      throw new UnauthorizedException('access token만 허용됩니다.');
    }

    request.user = {
      userId: decoded.sub,
      tenantId: decoded.tenantId,
      serviceId: decoded.serviceId,
      scopes: decoded.scopes ?? [],
      tokenType: 'access',
      jti: decoded.jti,
      localDevToken: decoded.localDevToken === true,
    };
    return true;
  }

  private isAccessTokenPayload(payload: unknown): payload is AccessTokenPayload {
    if (typeof payload !== 'object' || payload === null) {
      return false;
    }

    const candidate = payload as Partial<AccessTokenPayload>;
    return (
      typeof candidate.sub === 'string' &&
      typeof candidate.jti === 'string' &&
      (candidate.tokenType === 'access' || candidate.tokenType === 'refresh') &&
      typeof candidate.iat === 'number' &&
      typeof candidate.exp === 'number'
    );
  }

  private parseDevScopes(raw: string | undefined): string[] {
    if (!raw) {
      return ['*'];
    }
    return raw
      .split(',')
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0);
  }
}
