import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';
import { AgentServerModule } from '../../shared/agent-server/agent-server.module';

@Module({
  imports: [AgentServerModule],
  controllers: [ChatController],
  providers: [ChatService, InternalApiKeyGuard],
})
export class ChatModule {}
