import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Realtime Module — provides the downstream WebSocket to the Frontend.
 * Global so any service can inject RealtimeGateway to emit updates.
 */
@Global()
@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}