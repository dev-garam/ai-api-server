import { Injectable, NotImplementedException } from '@nestjs/common';
import { TranslateRequestDto, TranslateResponseDto } from './dtos/translate.dto';
import {
  SeparateSemanticUnitsRequestDto,
  SeparateSemanticUnitsResponseDto,
} from './dtos/semantic-units.dto';

@Injectable()
export class InterpretingService {
  constructor() {}

  async translate(dto: TranslateRequestDto): Promise<TranslateResponseDto> {
    void dto;
    throw new NotImplementedException(
      '현재 연결된 node-agent-server는 intent detect 전용입니다. translate 기능은 별도 서비스 연결 후 활성화됩니다.',
    );
  }

  async separateSemanticUnits(
    dto: SeparateSemanticUnitsRequestDto,
  ): Promise<SeparateSemanticUnitsResponseDto> {
    void dto;
    throw new NotImplementedException(
      '현재 연결된 node-agent-server는 intent detect 전용입니다. semantic-units 기능은 별도 서비스 연결 후 활성화됩니다.',
    );
  }
}
