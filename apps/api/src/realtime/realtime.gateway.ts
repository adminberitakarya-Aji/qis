import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, WebSocket } from 'ws';

/**
 * Realtime Gateway — downstream WebSocket to the Frontend.
 *
 * Per BUSINESS_RULES_ADDENDUM.md (Real-Time Data Rules):
 * - Order status changes
 * - Portfolio balance changes
 * - Active Grid status
 * must be delivered through a real-time channel (WebSocket).
 *
 * This gateway is the API layer's downstream WebSocket to the Frontend.
 * It does NOT connect to any exchange WebSocket — that is Exchange Engine's
 * responsibility (upstream).
 */
@WebSocketGateway({
  path: '/realtime',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  private clients = new Map<WebSocket, { userId?: string }>();

  handleConnection(client: WebSocket) {
    this.clients.set(client, {});
    this.logger.log(`[Realtime] Client connected. Total: ${this.clients.size}`);
  }

  handleDisconnect(client: WebSocket) {
    this.clients.delete(client);
    this.logger.log(`[Realtime] Client disconnected. Total: ${this.clients.size}`);
  }

  /**
   * Broadcasts an event to all connected clients.
   * Used for global events (e.g. market updates).
   */
  broadcast(event: string, data: unknown) {
    const payload = JSON.stringify({ event, data, timestamp: Date.now() });
    for (const client of this.clients.keys()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  /**
   * Sends an event to a specific user's clients.
   * Used for user-scoped events (e.g. order status, portfolio).
   */
  sendToUser(userId: string, event: string, data: unknown) {
    const payload = JSON.stringify({ event, data, timestamp: Date.now() });
    for (const [client, meta] of this.clients.entries()) {
      if (meta.userId === userId && client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  /**
   * Emits an order status update to the strategy owner.
   */
  emitOrderUpdate(userId: string, order: unknown) {
    this.sendToUser(userId, 'order.update', order);
  }

  /**
   * Emits a portfolio update to the user.
   */
  emitPortfolioUpdate(userId: string, portfolio: unknown) {
    this.sendToUser(userId, 'portfolio.update', portfolio);
  }

  /**
   * Emits a strategy status update to the user.
   */
  emitStrategyUpdate(userId: string, strategy: unknown) {
    this.sendToUser(userId, 'strategy.update', strategy);
  }
}