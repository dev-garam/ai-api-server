import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { AgentServerModule } from '../../shared/agent-server/agent-server.module';

@Module({
  imports: [AgentServerModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
