import { ArrayNotEmpty, IsArray, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TranslateRequestDto {
  @ApiProperty({ example: 'ko' })
  @IsString()
  @MinLength(2)
  sourceLanguageCode!: string;

  @ApiProperty({ example: ['en', 'ja'], type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  targetLanguageCode!: string[];

  @ApiProperty({ example: '안녕하세요, 반갑습니다.' })
  @IsString()
  @MinLength(1)
  text!: string;
}

export class TranslateResponseDto {
  @ApiProperty({ example: '안녕하세요, 반갑습니다.' })
  originalText!: string;

  @ApiProperty({
    example: {
      en: 'Hello, nice to meet you.',
      ja: 'こんにちは、お会いできてうれしいです。',
    },
  })
  translatedText!: Record<string, string>;
}
