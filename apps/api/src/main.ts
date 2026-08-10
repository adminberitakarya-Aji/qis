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

  // TEMPORARY DIAGNOSTIC — remove after confirming WS handshake works.
  // Logs every raw HTTP 'upgrade' event the underlying Node server receives,
  // so we can see whether Nest's WsAdapter listener is even firing and what
  // pathname it computes, before deciding it doesn't match the gateway path.
  const rawHttpServer = app.getHttpServer();
  rawHttpServer.on('upgrade', (req: any) => {
    logger.info('[DEBUG] raw upgrade event received', { url: req.url, headers: req.headers });
  });

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
