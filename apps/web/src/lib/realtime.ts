/**
 * Realtime WebSocket Client
 * Connects to the NestJS API WebSocket gateway for real-time updates:
 * - order.update   — grid order status changes
 * - portfolio.update — portfolio balance changes
 * - strategy.update — active grid strategy status changes
 *
 * Per BUSINESS_RULES_ADDENDUM.md (Real-Time Data Rules), these events
 * must be pushed to the frontend rather than polled.
 */

import { getAccessToken } from './auth';

export type RealtimeEvent =
  | 'order.update'
  | 'portfolio.update'
  | 'strategy.update';

export interface RealtimeMessage<T = unknown> {
  event: RealtimeEvent;
  data: T;
  timestamp: number;
}

type MessageHandler<T = unknown> = (message: RealtimeMessage<T>) => void;

class RealtimeClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<RealtimeEvent, Set<MessageHandler>>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly WS_URL =
    process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000/realtime';

  private getWebSocketUrl(): string {
    const token = getAccessToken();
    if (token) {
      const separator = this.WS_URL.includes('?') ? '&' : '?';
      return `${this.WS_URL}${separator}token=${encodeURIComponent(token)}`;
    }
    return this.WS_URL;
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    console.log('[Realtime] Connecting to WebSocket...');
    this.ws = new WebSocket(this.getWebSocketUrl());

    this.ws.onopen = () => {
      console.log('[Realtime] Connected');
      this.reconnectAttempts = 0;

      // Heartbeat to keep connection alive
      this.heartbeatTimer = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30_000);
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as RealtimeMessage;
        const eventHandlers = this.handlers.get(message.event);
        if (eventHandlers) {
          for (const handler of eventHandlers) {
            handler(message);
          }
        }
      } catch (err) {
        console.warn('[Realtime] Failed to parse message:', err);
      }
    };

    this.ws.onclose = () => {
      console.warn('[Realtime] Connection closed. Reconnecting...');
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error('[Realtime] WebSocket error:', err);
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(3000 * Math.pow(2, this.reconnectAttempts), 30_000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  on<T = unknown>(event: RealtimeEvent, handler: MessageHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as MessageHandler);
    return () => this.off(event, handler);
  }

  off<T = unknown>(event: RealtimeEvent, handler: MessageHandler<T>) {
    this.handlers.get(event)?.delete(handler as MessageHandler);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Singleton instance
export const realtimeClient = new RealtimeClient();