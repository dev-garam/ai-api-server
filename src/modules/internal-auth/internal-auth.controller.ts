import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';
import { ApiProperty } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';

class InternalAuthCheckResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;

  @ApiProperty({ example: 'lite-api-key' })
  mode!: 'lite-api-key';
}

@Controller({
  path: 'internal/auth',
  version: '1',
})
@ApiTags('내부 인증(약식)')
@Public()
export class InternalAuthController {
  @Get('check')
  @UseGuards(InternalApiKeyGuard)
  @ApiOperation({ summary: '내부 API 키 검증 (약식 모드)' })
  @ApiHeader({
    name: 'x-internal-api-key',
    required: true,
    description: '서버 간 호출용 내부 API 키',
  })
  @ApiResponse({ status: 200, type: InternalAuthCheckResponseDto })
  @ApiResponse({ status: 401, description: '유효하지 않은 내부 API 키' })
  check(): InternalAuthCheckResponseDto {
    return { ok: true, mode: 'lite-api-key' };
  }
}
