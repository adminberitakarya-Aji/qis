import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationEngine,
  type NotificationConfig,
  type NotificationEvent,
} from '@qis/notification-engine';
import { createServiceLogger } from '@qis/logger';

const logger = createServiceLogger('qis-api:ops-alerting');

export interface OpsAlertEvent {
  event: string;
  title: string;
  message: string;
  details?: Record<string, string | number>;
  severity: 'critical' | 'warning';
}

@Injectable()
export class OpsAlertingService implements OnModuleInit {
  private notificationEngine = new NotificationEngine();
  private config: NotificationConfig | null = null;
  private enabled = false;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.initializeConfig();
  }

  private initializeConfig(): void {
    const botToken = this.configService.get<string>('OPS_TELEGRAM_BOT_TOKEN');
    const chatId = this.configService.get<string>('OPS_TELEGRAM_CHAT_ID');

    if (botToken && chatId) {
      this.config = {
        telegram: {
          botToken,
          chatId,
        },
      };
      this.enabled = true;
      logger.info('Ops alerting initialized with Telegram', { chatId: this.maskChatId(chatId) });
    } else {
      logger.warn('Ops alerting not configured — missing OPS_TELEGRAM_BOT_TOKEN or OPS_TELEGRAM_CHAT_ID');
    }
  }

  private maskChatId(chatId: string): string {
    if (chatId.length <= 4) return '****';
    return chatId.slice(0, 2) + '****' + chatId.slice(-2);
  }

  /**
   * Send an operational alert to the dedicated ops channel.
   * This is separate from user-facing notifications.
   */
  async alert(event: OpsAlertEvent): Promise<void> {
    if (!this.enabled || !this.config) {
      logger.debug('Ops alerting disabled, skipping alert', { event: event.event });
      return;
    }

    const payload = {
      event: 'custom' as NotificationEvent,
      title: `[${event.severity.toUpperCase()}] ${event.title}`,
      message: event.message,
      details: event.details,
      timestamp: Date.now(),
    };

    try {
      await this.notificationEngine.notify(payload, this.config);
      logger.info('Ops alert sent', { event: event.event, severity: event.severity });
    } catch (err: any) {
      logger.error('Failed to send ops alert', { event: event.event }, err);
    }
  }

  /**
   * Critical alerts that should wake you up
   */
  async critical(event: Omit<OpsAlertEvent, 'severity'>): Promise<void> {
    return this.alert({ ...event, severity: 'critical' });
  }

  /**
   * Warning alerts for awareness
   */
  async warning(event: Omit<OpsAlertEvent, 'severity'>): Promise<void> {
    return this.alert({ ...event, severity: 'warning' });
  }

  // ============================================================
  // Pre-defined alert types for common operational events
  // ============================================================

  /** Worker process crashed or is shutting down unexpectedly */
  async workerCrashed(details: { reason: string; stack?: string }): Promise<void> {
    return this.critical({
      event: 'worker_crashed',
      title: 'Worker Process Crashed',
      message: `Qis Worker process terminated unexpectedly: ${details.reason}`,
      details,
    });
  }

  /** Worker failed to reconnect WebSocket after N retries */
  async workerWebSocketReconnectFailed(details: {
    exchange: string;
    symbol: string;
    attempts: number;
    lastError: string;
  }): Promise<void> {
    return this.critical({
      event: 'worker_ws_reconnect_failed',
      title: 'Worker WebSocket Reconnection Failed',
      message: `Failed to reconnect to ${details.exchange} WebSocket for ${details.symbol} after ${details.attempts} attempts`,
      details,
    });
  }

  /** triggerGridOrder threw an unhandled error */
  async triggerGridOrderError(details: {
    orderId: string;
    strategyId: string;
    error: string;
    stack?: string;
  }): Promise<void> {
    return this.critical({
      event: 'trigger_grid_order_error',
      title: 'triggerGridOrder Unhandled Error',
      message: `Critical error in triggerGridOrder for order ${details.orderId}: ${details.error}`,
      details,
    });
  }

  /** stopExecution threw an unhandled error */
  async stopExecutionError(details: {
    strategyId: string;
    error: string;
    stack?: string;
  }): Promise<void> {
    return this.critical({
      event: 'stop_execution_error',
      title: 'stopExecution Unhandled Error',
      message: `Critical error in stopExecution for strategy ${details.strategyId}: ${details.error}`,
      details,
    });
  }

  /** Exchange call exhausted all retries (MAX_RETRY reached) */
  async exchangeRetryExhausted(details: {
    operation: 'market_buy' | 'tp_placement' | 'cancel_order';
    orderId: string;
    strategyId: string;
    exchange: string;
    symbol: string;
    attempts: number;
    lastError: string;
  }): Promise<void> {
    return this.critical({
      event: 'exchange_retry_exhausted',
      title: 'Exchange Retry Exhausted',
      message: `${details.operation} failed after ${details.attempts} attempts for order ${details.orderId}`,
      details,
    });
  }

  /** PostgreSQL connection pool exhaustion or connection errors */
  async databaseConnectionError(details: {
    error: string;
    poolSize?: number;
    idleCount?: number;
    waitingCount?: number;
  }): Promise<void> {
    return this.critical({
      event: 'database_connection_error',
      title: 'Database Connection Error',
      message: `PostgreSQL connection error: ${details.error}`,
      details,
    });
  }

  /** Generic critical error for catch-all */
  async genericCritical(details: {
    source: string;
    error: string;
    stack?: string;
    context?: Record<string, string | number>;
  }): Promise<void> {
    return this.critical({
      event: 'generic_critical',
      title: `Critical Error in ${details.source}`,
      message: details.error,
      details: { ...details.context, source: details.source, stack: details.stack ?? '' },
    });
  }

  /**
   * Risk Engine blocked a strategy launch (pre-trade check failed).
   * Per ROADMAP.md Phase 2: reuse Phase 0's alerting channel for risk
   * events instead of building a separate risk dashboard.
   */
  async riskCheckBlocked(details: {
    userId: string;
    exchangeAccountId: string;
    pair: string;
    capital: number;
    reasons: string[];
  }): Promise<void> {
    return this.warning({
      event: 'risk_check_blocked',
      title: 'Strategy Blocked: Risk Check Failed',
      message: `Strategy launch blocked for ${details.pair} (${details.capital} USDT) on account ${details.exchangeAccountId}`,
      details: {
        userId: details.userId,
        exchangeAccountId: details.exchangeAccountId,
        pair: details.pair,
        capital: details.capital,
        reasons: details.reasons.join(', '),
      },
    });
  }
}
