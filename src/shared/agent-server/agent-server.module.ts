import { Module } from '@nestjs/common';
import { AgentServerService } from './agent-server.service';

@Module({
  providers: [AgentServerService],
  exports: [AgentServerService],
})
export class AgentServerModule {}
