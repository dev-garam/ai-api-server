import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AI API Server')
    .setDescription('범용 AI MSA API 문서')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: '유저 access token',
      },
      'access-token',
    )
    .addTag('헬스체크', '서비스 상태 및 의존성(DB/Redis) 연결 확인')
    .addTag('인증', '유저 티켓 발급 및 refresh token 재발급')
    .addTag('내부 인증(약식)', 'x-internal-api-key 기반 임시 서버 간 인증')
    .addTag('채팅 세션', '세션 기반 채팅 요청 및 SSE 스트리밍 응답')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, swaggerDocument);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
