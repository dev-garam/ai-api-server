import { ApiProperty } from '@nestjs/swagger';

export class HealthDependencyStatusDto {
  @ApiProperty({ example: 'up', enum: ['up', 'down'] })
  status!: 'up' | 'down';

  @ApiProperty({ example: 4, description: 'Connection check latency in milliseconds' })
  latencyMs!: number;

  @ApiProperty({ required: false, example: 'connection timeout' })
  error?: string;
}

export class LivenessResponseDto {
  @ApiProperty({ example: 'ok', enum: ['ok'] })
  status!: 'ok';

  @ApiProperty({ example: 'liveness', enum: ['liveness'] })
  type!: 'liveness';

  @ApiProperty({ example: '2026-03-02T21:30:00.000Z' })
  timestamp!: string;
}

export class ReadinessDependenciesDto {
  @ApiProperty({ type: () => HealthDependencyStatusDto })
  postgres!: HealthDependencyStatusDto;

  @ApiProperty({ type: () => HealthDependencyStatusDto })
  redis!: HealthDependencyStatusDto;

  @ApiProperty({ type: () => HealthDependencyStatusDto })
  agentServer!: HealthDependencyStatusDto;
}

export class ReadinessResponseDto {
  @ApiProperty({ example: 'ok', enum: ['ok', 'degraded'] })
  status!: 'ok' | 'degraded';

  @ApiProperty({ example: 'readiness', enum: ['readiness'] })
  type!: 'readiness';

  @ApiProperty({ example: '2026-03-02T21:30:00.000Z' })
  timestamp!: string;

  @ApiProperty({ type: () => ReadinessDependenciesDto })
  dependencies!: ReadinessDependenciesDto;
}
