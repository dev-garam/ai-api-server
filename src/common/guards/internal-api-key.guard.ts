import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const expected = this.configService.get<string>('INTERNAL_API_KEY');

    if (!expected) {
      throw new UnauthorizedException('INTERNAL_API_KEY is not configured');
    }

    const received = request.headers['x-internal-api-key'];
    if (!received || received !== expected) {
      throw new UnauthorizedException('Invalid internal api key');
    }

    return true;
  }
}
