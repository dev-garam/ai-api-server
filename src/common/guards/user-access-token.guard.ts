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

interface AccessTokenPayload {
  sub: string;
  tenantId?: string;
  scopes?: string[];
  tokenType: 'access' | 'refresh';
  jti: string;
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
      scopes: decoded.scopes ?? [],
      tokenType: 'access',
      jti: decoded.jti,
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
}
