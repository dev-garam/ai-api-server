import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { LivenessResponseDto, ReadinessResponseDto } from './dtos/health-response.dto';
import { Public } from '../../common/decorators/public.decorator';

@Controller({
  path: 'health',
  version: '1',
})
@ApiTags('헬스체크')
@Public()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('liveness')
  @ApiOperation({ summary: '라이브니스 체크' })
  @ApiResponse({ status: 200, type: LivenessResponseDto })
  liveness(): LivenessResponseDto {
    return this.healthService.getLiveness();
  }

  @Get('readiness')
  @ApiOperation({ summary: '레디니스 체크 (PostgreSQL/Redis 연결 상태 포함)' })
  @ApiResponse({ status: 200, type: ReadinessResponseDto })
  @ApiResponse({ status: 503, type: ReadinessResponseDto })
  readiness(): Promise<ReadinessResponseDto> {
    return this.healthService.getReadiness().then((result) => {
      if (result.status !== 'ok') {
        throw new ServiceUnavailableException(result);
      }
      return result;
    });
  }
}
