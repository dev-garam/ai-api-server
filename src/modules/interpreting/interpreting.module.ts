import { Module } from '@nestjs/common';
import { InterpretingController } from './interpreting.controller';
import { InterpretingService } from './interpreting.service';
import { AgentServerModule } from '../../shared/agent-server/agent-server.module';

@Module({
  imports: [AgentServerModule],
  controllers: [InterpretingController],
  providers: [InterpretingService],
})
export class InterpretingModule {}
