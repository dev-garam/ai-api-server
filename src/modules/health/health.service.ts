import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { AgentServerService } from '../../shared/agent-server/agent-server.service';
import {
  HealthDependencyStatusDto,
  LivenessResponseDto,
  ReadinessDependenciesDto,
  ReadinessResponseDto,
} from './dtos/health-response.dto';

@Injectable()
export class HealthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly agentServerService: AgentServerService,
  ) {}

  getLiveness(): LivenessResponseDto {
    return {
      status: 'ok',
      type: 'liveness',
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<ReadinessResponseDto> {
    const [postgres, redis, agentServer] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkAgentServer(),
    ]);

    const dependencies: ReadinessDependenciesDto = {
      postgres,
      redis,
      agentServer,
    };

    const overall =
      postgres.status === 'up' && redis.status === 'up' && agentServer.status === 'up'
        ? 'ok'
        : 'degraded';

    return {
      status: overall,
      type: 'readiness',
      timestamp: new Date().toISOString(),
      dependencies,
    };
  }

  private async checkPostgres(): Promise<HealthDependencyStatusDto> {
    const started = Date.now();
    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      return {
        status: 'up',
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : 'postgres connectivity check failed',
      };
    }
  }

  private async checkRedis(): Promise<HealthDependencyStatusDto> {
    const started = Date.now();
    try {
      const pong = await this.redisService.ping();
      if (pong !== 'PONG') {
        return {
          status: 'down',
          latencyMs: Date.now() - started,
          error: `unexpected redis ping response: ${pong}`,
        };
      }
      return {
        status: 'up',
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : 'redis connectivity check failed',
      };
    }
  }

  private async checkAgentServer(): Promise<HealthDependencyStatusDto> {
    const started = Date.now();
    try {
      await this.agentServerService.ping();
      return {
        status: 'up',
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : 'agent server connectivity check failed',
      };
    }
  }
}
