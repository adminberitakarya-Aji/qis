// Qis Execution Engine
// Responsible for:
// - Executing MARKET BUY when a grid level is touched/crossed (trigger-based)
// - Placing Take Profit SELL LIMIT orders immediately after market buy fill
// - Retry logic for failed placements
// - Order cancellation on strategy stop
// Never makes strategy decisions.
//
// Grid levels are VIRTUAL trigger points — NOT limit orders in the order book.
// The Worker monitors real-time price and triggers this Engine when a level
// is crossed. Execution is always a MARKET order for guaranteed fill.
//
// Secret Ownership Rule:
//   Execution Engine does NOT decrypt. It receives encrypted blobs and
//   forwards them to Exchange Engine. Exchange Engine is the only Engine
//   that holds the Master Key.

import { ExchangeEngine, type DecryptContext } from '@qis/exchange-engine';

export type OrderStatus =
  | 'pending'
  | 'filled'
  | 'tp_placed'
  | 'tp_filled'
  | 'canceled'
  | 'error';

export interface ExecutionOrderState {
  dbId: string;
  clientOrderId: string;
  exchangeOrderId: string | null;
  tpExchangeOrderId: string | null;
  sectionIndex: number;
  orderIndex: number;
  globalOrderIndex: number;
  gridPrice: number;
  tpPrice: number;
  allocatedCapital: number;
  estimatedQuantity: number;
  status: OrderStatus;
  buyFilledPrice: number | null;
  buyFilledQuantity: number | null;
  buyFee: number | null;
  tpFilledPrice: number | null;
  tpFee: number | null;
  realizedPnl: number | null;
}

export interface EncryptedCredentials {
  encryptedApiKey: string;
  encryptedApiSecret: string;
  keyVersion: number;
  context?: DecryptContext;
}

const MAX_RETRY = 3;
const RETRY_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ExecutionEngine {
  private exchangeEngine: ExchangeEngine;

  constructor(exchangeEngine?: ExchangeEngine) {
    // Default: create one if not injected. DI-friendly for NestJS providers.
    this.exchangeEngine = exchangeEngine ?? new ExchangeEngine();
  }

  // ============================================================
  // *Encrypted methods — PREFERRED
  // Receives encrypted creds, forwards to Exchange Engine. No decryption
  // happens in this Engine.
  // ============================================================

  /**
   * Executes a MARKET BUY for a single grid order when price crosses
   * the grid level. Called by the Binance WebSocket Worker via
   * the trigger-order API endpoint.
   *
   * Level Crossing Rule (BUSINESS_RULES.md):
   * - Execution is always a Market Order (not limit) for guaranteed fill
   * - TP Sell Limit is placed IMMEDIATELY after Market Buy fill
   * - Actual fill price is used for TP calculation (not estimated grid price)
   */
  async executeSingleMarketBuyEncrypted(
    exchange: 'binance' | 'bybit',
    credentials: EncryptedCredentials,
    symbol: string,
    order: ExecutionOrderState,
    triggeredPrice: number,
  ): Promise<{
    exchangeOrderId: string | null;
    filledPrice: number | null;
    filledQuantity: number | null;
    fee: number | null;
    tpExchangeOrderId: string | null;
  }> {
    let exchangeOrderId: string | null = null;
    let filledPrice: number | null = null;
    let filledQuantity: number | null = null;
    let fee: number | null = null;
    let tpExchangeOrderId: string | null = null;

    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      try {
        const result = await this.exchangeEngine.executeOrderEncrypted({
          exchange,
          encryptedApiKey: credentials.encryptedApiKey,
          encryptedApiSecret: credentials.encryptedApiSecret,
          keyVersion: credentials.keyVersion,
          context: credentials.context,
          symbol,
          side: 'buy',
          amount: order.estimatedQuantity,
          price: triggeredPrice,
          type: 'market',
          clientOrderId: order.clientOrderId,
        });

        exchangeOrderId = result.id;
        filledPrice = result.executedPrice ?? triggeredPrice;
        filledQuantity = result.filled ?? order.estimatedQuantity;
        fee = result.fee ?? 0;
        break;
      } catch (error: any) {
        console.error(
          `[ExecutionEngine] Market buy failed for ${order.clientOrderId} (attempt ${attempt}/${MAX_RETRY}):`,
          error.message,
        );
        if (attempt < MAX_RETRY) await sleep(RETRY_DELAY_MS);
      }
    }

    if (filledPrice !== null && filledQuantity !== null) {
      const tpMultiplier = order.tpPrice / order.gridPrice;
      const actualTpPrice = Number((filledPrice * tpMultiplier).toFixed(8));

      const tpClientOrderId = `${order.clientOrderId}_tp`;

      for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
        try {
          const tpResult = await this.exchangeEngine.executeOrderEncrypted({
            exchange,
            encryptedApiKey: credentials.encryptedApiKey,
            encryptedApiSecret: credentials.encryptedApiSecret,
            keyVersion: credentials.keyVersion,
            context: credentials.context,
            symbol,
            side: 'sell',
            amount: filledQuantity,
            price: actualTpPrice,
            type: 'limit',
            clientOrderId: tpClientOrderId,
          });
          tpExchangeOrderId = tpResult.id;
          console.log(
            `[ExecutionEngine] TP Sell placed for ${order.clientOrderId} at $${actualTpPrice} (fill was $${filledPrice})`,
          );
          break;
        } catch (tpErr: any) {
          console.error(
            `[ExecutionEngine] TP placement failed for ${order.clientOrderId} (attempt ${attempt}/${MAX_RETRY}):`,
            tpErr.message,
          );
          if (attempt < MAX_RETRY) await sleep(RETRY_DELAY_MS);
        }
      }
    }

    return { exchangeOrderId, filledPrice, filledQuantity, fee, tpExchangeOrderId };
  }

  /**
   * Cancels all open TP SELL LIMIT orders for a strategy.
   * Called when the trader stops a strategy.
   *
   * Note: In the trigger-based model (Mode B), there are NO buy limit orders
   * in the order book. Only TP SELL LIMIT orders exist after a market buy
   * has been filled. This method cancels those TP orders.
   */
  async cancelAllOpenOrdersEncrypted(
    exchange: 'binance' | 'bybit',
    credentials: EncryptedCredentials,
    symbol: string,
    orders: ExecutionOrderState[]
  ): Promise<{ canceled: number; errors: number }> {
    let canceled = 0;
    let errCount = 0;

    for (const order of orders) {
      if (order.status === 'tp_placed' && order.tpExchangeOrderId) {
        const ok = await this.exchangeEngine.cancelOrderEncrypted(
          exchange,
          credentials.encryptedApiKey,
          credentials.encryptedApiSecret,
          order.tpExchangeOrderId,
          symbol,
          credentials.context,
        );
        if (ok) {
          canceled++;
        } else {
          errCount++;
        }
      }
    }

    return { canceled, errors: errCount };
  }

  // ============================================================
  // Plaintext methods — kept for internal Engine-to-Engine calls only.
  // Business/API layers MUST use the *Encrypted variants above.
  // ============================================================

  /**
   * Executes a MARKET BUY for a single grid order when price crosses
   * the grid level. Plaintext variant for internal Engine-to-Engine calls.
   */
  async executeSingleMarketBuy(
    exchange: 'binance' | 'bybit',
    apiKey: string,
    apiSecret: string,
    symbol: string,
    order: ExecutionOrderState,
    triggeredPrice: number,
  ): Promise<{
    exchangeOrderId: string | null;
    filledPrice: number | null;
    filledQuantity: number | null;
    fee: number | null;
    tpExchangeOrderId: string | null;
  }> {
    let exchangeOrderId: string | null = null;
    let filledPrice: number | null = null;
    let filledQuantity: number | null = null;
    let fee: number | null = null;
    let tpExchangeOrderId: string | null = null;

    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      try {
        const result = await this.exchangeEngine.executeOrder({
          exchange,
          apiKey,
          apiSecret,
          symbol,
          side: 'buy',
          amount: order.estimatedQuantity,
          price: triggeredPrice,
          type: 'market',
          clientOrderId: order.clientOrderId,
        });

        exchangeOrderId = result.id;
        filledPrice = result.executedPrice ?? triggeredPrice;
        filledQuantity = result.filled ?? order.estimatedQuantity;
        fee = result.fee ?? 0;
        break;
      } catch (error: any) {
        console.error(
          `[ExecutionEngine] Market buy failed for ${order.clientOrderId} (attempt ${attempt}/${MAX_RETRY}):`,
          error.message,
        );
        if (attempt < MAX_RETRY) await sleep(RETRY_DELAY_MS);
      }
    }

    if (filledPrice !== null && filledQuantity !== null) {
      const tpMultiplier = order.tpPrice / order.gridPrice;
      const actualTpPrice = Number((filledPrice * tpMultiplier).toFixed(8));

      const tpClientOrderId = `${order.clientOrderId}_tp`;

      for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
        try {
          const tpResult = await this.exchangeEngine.executeOrder({
            exchange,
            apiKey,
            apiSecret,
            symbol,
            side: 'sell',
            amount: filledQuantity,
            price: actualTpPrice,
            type: 'limit',
            clientOrderId: tpClientOrderId,
          });
          tpExchangeOrderId = tpResult.id;
          console.log(
            `[ExecutionEngine] TP Sell placed for ${order.clientOrderId} at $${actualTpPrice} (fill was $${filledPrice})`,
          );
          break;
        } catch (tpErr: any) {
          console.error(
            `[ExecutionEngine] TP placement failed for ${order.clientOrderId} (attempt ${attempt}/${MAX_RETRY}):`,
            tpErr.message,
          );
          if (attempt < MAX_RETRY) await sleep(RETRY_DELAY_MS);
        }
      }
    }

    return { exchangeOrderId, filledPrice, filledQuantity, fee, tpExchangeOrderId };
  }

  /**
   * Cancels all open TP SELL LIMIT orders for a strategy.
   * Plaintext variant for internal Engine-to-Engine calls.
   */
  async cancelAllOpenOrders(
    exchange: 'binance' | 'bybit',
    apiKey: string,
    apiSecret: string,
    symbol: string,
    orders: ExecutionOrderState[]
  ): Promise<{ canceled: number; errors: number }> {
    let canceled = 0;
    let errCount = 0;

    for (const order of orders) {
      if (order.status === 'tp_placed' && order.tpExchangeOrderId) {
        const ok = await this.exchangeEngine.cancelOrder(
          exchange,
          apiKey,
          apiSecret,
          order.tpExchangeOrderId,
          symbol,
        );
        if (ok) {
          canceled++;
        } else {
          errCount++;
        }
      }
    }

    return { canceled, errors: errCount };
  }

  /**
   * Calculates summary stats for an active strategy's orders.
   */
  summarizeOrders(orders: ExecutionOrderState[]) {
    const counts = {
      total: orders.length,
      pending: 0,
      filled: 0,
      tpPlaced: 0,
      tpFilled: 0,
      canceled: 0,
      error: 0,
      totalRealizedPnl: 0,
    };

    for (const o of orders) {
      if (o.status === 'tp_placed') counts.tpPlaced++;
      else if (o.status === 'tp_filled') counts.tpFilled++;
      else if (o.status in counts) counts[o.status as keyof typeof counts]++;

      if (o.realizedPnl !== null) {
        counts.totalRealizedPnl += o.realizedPnl;
      }
    }

    return counts;
  }
}