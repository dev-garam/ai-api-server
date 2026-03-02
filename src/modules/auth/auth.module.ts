import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, InternalApiKeyGuard],
  exports: [AuthService],
})
export class AuthModule {}
