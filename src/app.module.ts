import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module';
import { InternalAuthModule } from './modules/internal-auth/internal-auth.module';
import { InterpretingModule } from './modules/interpreting/interpreting.module';
import { ChatModule } from './modules/chat/chat.module';
import { AuthModule } from './modules/auth/auth.module';
import { DatabaseModule } from './shared/database/database.module';
import { RedisModule } from './shared/redis/redis.module';
import { AgentServerModule } from './shared/agent-server/agent-server.module';
import { UserAccessTokenGuard } from './common/guards/user-access-token.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    RedisModule,
    AgentServerModule,
    HealthModule,
    AuthModule,
    InternalAuthModule,
    ChatModule,
    InterpretingModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: UserAccessTokenGuard,
    },
  ],
})
export class AppModule {}
