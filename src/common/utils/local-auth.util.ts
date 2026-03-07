import { ConfigService } from '@nestjs/config';

function isTrue(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === 'true';
}

export function isLocalAuthBypassEnabled(configService: ConfigService): boolean {
  const nodeEnv = configService.get<string>('NODE_ENV')?.trim().toLowerCase();
  const bypassEnabled = isTrue(configService.get<string>('LOCAL_AUTH_BYPASS'));
  return nodeEnv === 'local' && bypassEnabled;
}
