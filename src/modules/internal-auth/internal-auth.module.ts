import { Module } from '@nestjs/common';
import { InternalAuthController } from './internal-auth.controller';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';

@Module({
  controllers: [InternalAuthController],
  providers: [InternalApiKeyGuard],
  exports: [InternalApiKeyGuard],
})
export class InternalAuthModule {}
