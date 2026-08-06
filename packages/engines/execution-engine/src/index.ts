// Qis Execution Engine
// Responsible for:
// - Placing Buy Limit Orders on exchange at grid price levels
// - Monitoring order fill status
// - Placing Take Profit Sell Orders when Buy is FILLED
// - Retry logic for failed placements
// - Order cancellation on strategy stop
// Never makes strategy decisions.
//
// Secret Ownership Rule:
//   Execution Engine does NOT decrypt. It receives encrypted blobs and
//   forwards them to Exchange Engine. Exchange Engine is the only Engine
//   that holds the Master Key.

import { ExchangeEngine, type DecryptContext } from '@qis/exchange-engine';

export type OrderStatus =
  | 'pending'
  | 'placed'
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

export interface PlaceGridOrdersResult {
  placed: number;
  failed: number;
  orders: ExecutionOrderState[];
}

export interface CheckAndFillResult {
  filled: string[];
  tpPlaced: string[];
  tpFilled: string[];
  errors: string[];
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

  async placeGridOrdersEncrypted(
    exchange: 'binance' | 'bybit',
    credentials: EncryptedCredentials,
    symbol: string,
    orders: ExecutionOrderState[]
  ): Promise<PlaceGridOrdersResult> {
    let placed = 0;
    let failed = 0;
    const updatedOrders = [...orders];

    for (const order of updatedOrders) {
      if (order.status !== 'pending') continue;

      let success = false;
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
            price: order.gridPrice,
            type: 'limit',
            clientOrderId: order.clientOrderId,
          });

          order.exchangeOrderId = result.id;
          order.status = 'placed';
          placed++;
          success = true;
          break;
        } catch (error: any) {
          console.error(
            `[ExecutionEngine] Failed to place buy order ${order.clientOrderId} (attempt ${attempt}/${MAX_RETRY}):`,
            error.message,
          );
          if (attempt < MAX_RETRY) await sleep(RETRY_DELAY_MS);
        }
      }

      if (!success) {
        order.status = 'error';
        failed++;
      }
    }

    return { placed, failed, orders: updatedOrders };
  }

  async checkAndProcessFillsEncrypted(
    exchange: 'binance' | 'bybit',
    credentials: EncryptedCredentials,
    symbol: string,
    orders: ExecutionOrderState[]
  ): Promise<CheckAndFillResult> {
    const filled: string[] = [];
    const tpPlaced: string[] = [];
    const tpFilled: string[] = [];
    const errors: string[] = [];

    for (const order of orders) {
      try {
        if (order.status === 'placed' && order.exchangeOrderId) {
          const liveOrder = await this.exchangeEngine.fetchOrderEncrypted(
            exchange,
            credentials.encryptedApiKey,
            credentials.encryptedApiSecret,
            order.exchangeOrderId,
            symbol,
            credentials.context,
          );

          if (liveOrder.status === 'closed') {
            order.status = 'filled';
            order.buyFilledPrice = liveOrder.executedPrice;
            order.buyFilledQuantity = liveOrder.filled;
            order.buyFee = liveOrder.fee;
            filled.push(order.clientOrderId);

            const tpClientOrderId = `${order.clientOrderId}_tp`;
            try {
              const tpResult = await this.exchangeEngine.executeOrderEncrypted({
                exchange,
                encryptedApiKey: credentials.encryptedApiKey,
                encryptedApiSecret: credentials.encryptedApiSecret,
                keyVersion: credentials.keyVersion,
                context: credentials.context,
                symbol,
                side: 'sell',
                amount: order.buyFilledQuantity ?? order.estimatedQuantity,
                price: order.tpPrice,
                type: 'limit',
                clientOrderId: tpClientOrderId,
              });
              order.tpExchangeOrderId = tpResult.id;
              order.status = 'tp_placed';
              tpPlaced.push(order.clientOrderId);
            } catch (tpErr: any) {
              console.error(
                `[ExecutionEngine] Failed to place TP for ${order.clientOrderId}:`,
                tpErr.message,
              );
              errors.push(order.clientOrderId);
            }
          } else if (liveOrder.status === 'canceled') {
            order.status = 'canceled';
          }
        }

        if (order.status === 'tp_placed' && order.tpExchangeOrderId) {
          const tpLiveOrder = await this.exchangeEngine.fetchOrderEncrypted(
            exchange,
            credentials.encryptedApiKey,
            credentials.encryptedApiSecret,
            order.tpExchangeOrderId,
            symbol,
            credentials.context,
          );

          if (tpLiveOrder.status === 'closed') {
            order.tpFilledPrice = tpLiveOrder.executedPrice;
            order.tpFee = tpLiveOrder.fee;

            const buyCost = (order.buyFilledQuantity ?? 0) * (order.buyFilledPrice ?? 0);
            const buyFee = order.buyFee ?? 0;
            const sellRevenue = (tpLiveOrder.filled ?? 0) * tpLiveOrder.executedPrice;
            const sellFee = tpLiveOrder.fee ?? 0;
            order.realizedPnl = sellRevenue - sellFee - buyCost - buyFee;

            order.status = 'tp_filled';
            tpFilled.push(order.clientOrderId);
          } else if (tpLiveOrder.status === 'canceled') {
            order.status = 'filled';
            order.tpExchangeOrderId = null;
          }
        }
      } catch (pollErr: any) {
        console.error(
          `[ExecutionEngine] Error polling order ${order.clientOrderId}:`,
          pollErr.message,
        );
        errors.push(order.clientOrderId);
      }
    }

    return { filled, tpPlaced, tpFilled, errors };
  }

  async cancelAllOpenOrdersEncrypted(
    exchange: 'binance' | 'bybit',
    credentials: EncryptedCredentials,
    symbol: string,
    orders: ExecutionOrderState[]
  ): Promise<{ canceled: number; errors: number }> {
    let canceled = 0;
    let errCount = 0;

    for (const order of orders) {
      if (order.status === 'placed' && order.exchangeOrderId) {
        const ok = await this.exchangeEngine.cancelOrderEncrypted(
          exchange,
          credentials.encryptedApiKey,
          credentials.encryptedApiSecret,
          order.exchangeOrderId,
          symbol,
          credentials.context,
        );
        if (ok) {
          order.status = 'canceled';
          canceled++;
        } else {
          errCount++;
        }
      }

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

  // ============================================================
  // Plaintext methods — kept for internal Engine-to-Engine calls only.
  // Business/ API layers MUST use the *Encrypted variants above.
  // ============================================================

  async placeGridOrders(
    exchange: 'binance' | 'bybit',
    apiKey: string,
    apiSecret: string,
    symbol: string,
    orders: ExecutionOrderState[]
  ): Promise<PlaceGridOrdersResult> {
    let placed = 0;
    let failed = 0;
    const updatedOrders = [...orders];

    for (const order of updatedOrders) {
      if (order.status !== 'pending') continue;

      let success = false;
      for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
        try {
          const result = await this.exchangeEngine.executeOrder({
            exchange,
            apiKey,
            apiSecret,
            symbol,
            side: 'buy',
            amount: order.estimatedQuantity,
            price: order.gridPrice,
            type: 'limit',
            clientOrderId: order.clientOrderId,
          });

          order.exchangeOrderId = result.id;
          order.status = 'placed';
          placed++;
          success = true;
          break;
        } catch (error: any) {
          console.error(
            `[ExecutionEngine] Failed to place buy order ${order.clientOrderId} (attempt ${attempt}/${MAX_RETRY}):`,
            error.message,
          );
          if (attempt < MAX_RETRY) await sleep(RETRY_DELAY_MS);
        }
      }

      if (!success) {
        order.status = 'error';
        failed++;
      }
    }

    return { placed, failed, orders: updatedOrders };
  }

  async checkAndProcessFills(
    exchange: 'binance' | 'bybit',
    apiKey: string,
    apiSecret: string,
    symbol: string,
    orders: ExecutionOrderState[]
  ): Promise<CheckAndFillResult> {
    const filled: string[] = [];
    const tpPlaced: string[] = [];
    const tpFilled: string[] = [];
    const errors: string[] = [];

    for (const order of orders) {
      try {
        if (order.status === 'placed' && order.exchangeOrderId) {
          const liveOrder = await this.exchangeEngine.fetchOrder(
            exchange,
            apiKey,
            apiSecret,
            order.exchangeOrderId,
            symbol,
          );

          if (liveOrder.status === 'closed') {
            order.status = 'filled';
            order.buyFilledPrice = liveOrder.executedPrice;
            order.buyFilledQuantity = liveOrder.filled;
            order.buyFee = liveOrder.fee;
            filled.push(order.clientOrderId);

            const tpClientOrderId = `${order.clientOrderId}_tp`;
            try {
              const tpResult = await this.exchangeEngine.executeOrder({
                exchange,
                apiKey,
                apiSecret,
                symbol,
                side: 'sell',
                amount: order.buyFilledQuantity ?? order.estimatedQuantity,
                price: order.tpPrice,
                type: 'limit',
                clientOrderId: tpClientOrderId,
              });
              order.tpExchangeOrderId = tpResult.id;
              order.status = 'tp_placed';
              tpPlaced.push(order.clientOrderId);
            } catch (tpErr: any) {
              console.error(
                `[ExecutionEngine] Failed to place TP for ${order.clientOrderId}:`,
                tpErr.message,
              );
              errors.push(order.clientOrderId);
            }
          } else if (liveOrder.status === 'canceled') {
            order.status = 'canceled';
          }
        }

        if (order.status === 'tp_placed' && order.tpExchangeOrderId) {
          const tpLiveOrder = await this.exchangeEngine.fetchOrder(
            exchange,
            apiKey,
            apiSecret,
            order.tpExchangeOrderId,
            symbol,
          );

          if (tpLiveOrder.status === 'closed') {
            order.tpFilledPrice = tpLiveOrder.executedPrice;
            order.tpFee = tpLiveOrder.fee;

            const buyCost = (order.buyFilledQuantity ?? 0) * (order.buyFilledPrice ?? 0);
            const buyFee = order.buyFee ?? 0;
            const sellRevenue = (tpLiveOrder.filled ?? 0) * tpLiveOrder.executedPrice;
            const sellFee = tpLiveOrder.fee ?? 0;
            order.realizedPnl = sellRevenue - sellFee - buyCost - buyFee;

            order.status = 'tp_filled';
            tpFilled.push(order.clientOrderId);
          } else if (tpLiveOrder.status === 'canceled') {
            order.status = 'filled';
            order.tpExchangeOrderId = null;
          }
        }
      } catch (pollErr: any) {
        console.error(
          `[ExecutionEngine] Error polling order ${order.clientOrderId}:`,
          pollErr.message,
        );
        errors.push(order.clientOrderId);
      }
    }

    return { filled, tpPlaced, tpFilled, errors };
  }

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
      if (order.status === 'placed' && order.exchangeOrderId) {
        const ok = await this.exchangeEngine.cancelOrder(
          exchange,
          apiKey,
          apiSecret,
          order.exchangeOrderId,
          symbol,
        );
        if (ok) {
          order.status = 'canceled';
          canceled++;
        } else {
          errCount++;
        }
      }

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
   * Calculates summary stats for an active strategy's orders.
   */
  summarizeOrders(orders: ExecutionOrderState[]) {
    const counts = {
      total: orders.length,
      pending: 0,
      placed: 0,
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
