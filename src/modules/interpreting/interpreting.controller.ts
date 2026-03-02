import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InterpretingService } from './interpreting.service';
import { TranslateRequestDto, TranslateResponseDto } from './dtos/translate.dto';
import {
  SeparateSemanticUnitsRequestDto,
  SeparateSemanticUnitsResponseDto,
} from './dtos/semantic-units.dto';

@Controller({
  path: 'interpreting',
  version: '1',
})
@ApiTags('통역')
@ApiBearerAuth('access-token')
export class InterpretingController {
  constructor(private readonly interpretingService: InterpretingService) {}

  @Post('translate')
  @ApiOperation({ summary: '텍스트 번역' })
  @ApiResponse({ status: 200, type: TranslateResponseDto })
  @ApiResponse({ status: 401, description: '유효하지 않은 access token' })
  translate(@Body() dto: TranslateRequestDto): Promise<TranslateResponseDto> {
    return this.interpretingService.translate(dto);
  }

  @Post('semantic-units/split')
  @ApiOperation({ summary: '의미 단위 분리' })
  @ApiResponse({ status: 200, type: SeparateSemanticUnitsResponseDto })
  @ApiResponse({ status: 401, description: '유효하지 않은 access token' })
  separateSemanticUnits(
    @Body() dto: SeparateSemanticUnitsRequestDto,
  ): Promise<SeparateSemanticUnitsResponseDto> {
    return this.interpretingService.separateSemanticUnits(dto);
  }
}
