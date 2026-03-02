import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthServicePrincipal } from '../interfaces/auth-service.interface';

export const GetAuthService = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthServicePrincipal => {
    const request = ctx.switchToHttp().getRequest<{ serviceAuth?: AuthServicePrincipal }>();
    if (!request.serviceAuth) {
      throw new UnauthorizedException('인증된 서비스 정보가 없습니다.');
    }
    return request.serviceAuth;
  },
);
