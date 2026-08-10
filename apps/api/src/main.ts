import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { createServiceLogger } from '@qis/logger';

const logger = createServiceLogger('qis-api');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  // RealtimeGateway is written against the raw 'ws' library (Server/WebSocket
  // from 'ws', client.readyState checks). Without this, Nest defaults to the
  // Socket.io adapter, which speaks a different handshake protocol than the
  // frontend's native WebSocket client — causing connection failures.
  app.useWebSocketAdapter(new WsAdapter(app));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  logger.info('Qis API running', { url: `http://localhost:${port}/api/v1` });
}

void bootstrap();
