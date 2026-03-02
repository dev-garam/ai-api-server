import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SemanticUnitChunkRequestDto {
  @ApiProperty({ required: false, example: 0 })
  @IsOptional()
  index?: number;

  @ApiProperty({ example: '오늘은 날씨가 좋고 기분이 좋다.' })
  @IsString()
  text!: string;
}

export class SeparateSemanticUnitsRequestDto {
  @ApiProperty({ type: [SemanticUnitChunkRequestDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SemanticUnitChunkRequestDto)
  chunks!: SemanticUnitChunkRequestDto[];
}

export class SemanticUnitChunkResponseDto {
  @ApiProperty({ example: 0, nullable: true })
  index!: number | null;

  @ApiProperty({ example: '오늘은 날씨가 좋고 기분이 좋다.' })
  text!: string;
}

export class SeparateSemanticUnitsResponseDto {
  @ApiProperty({ type: [SemanticUnitChunkResponseDto] })
  chunks!: SemanticUnitChunkResponseDto[];
}
