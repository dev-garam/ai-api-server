import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';
import { ServiceHmacGuard } from '../../common/guards/service-hmac.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, InternalApiKeyGuard, ServiceHmacGuard],
  exports: [AuthService],
})
export class AuthModule {}
