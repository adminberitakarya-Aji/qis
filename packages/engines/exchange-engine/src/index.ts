// Qis Exchange Engine
//
// Secret Ownership Rule:
//   Only Exchange Engine may handle/receive decrypted secrets.
//   Business engines and API services call Exchange Engine methods with
//   ciphertext still encrypted. Decryption happens inside this module only.
//
// Responsibilities:
//   - REST API
//   - WebSocket (upstream to Binance/Bybit)
//   - Authentication (decryption of stored API credentials)
//   - Order Submission
// Contains no business logic.

import { ExchangeEngineCrypto, type DecryptContext } from './crypto.service';
import {
  ExchangeManager,
  type ExchangeBalance,
  type MarketTicker,
  type Candlestick,
  type OrderBook,
  type OrderExecutionParams,
  type ExecutionOrderResult,
  type ExchangeName,
} from '@qis/providers-exchange';

export { ExchangeEngineCrypto, type DecryptContext } from './crypto.service';
export type {
  ExchangeBalance,
  MarketTicker,
  Candlestick,
  OrderBook,
  OrderExecutionParams,
  ExecutionOrderResult,
  ExchangeName,
} from '@qis/providers-exchange';

export interface OrderExecutionParamsEncrypted {
  exchange: ExchangeName;
  encryptedApiKey: string;
  encryptedApiSecret: string;
  keyVersion: number;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  price?: number;
  type?: 'market' | 'limit';
  clientOrderId: string;
  context?: DecryptContext;
}

export class ExchangeEngine {
  private readonly crypto: ExchangeEngineCrypto;
  private readonly manager: ExchangeManager;

  constructor(crypto?: ExchangeEngineCrypto, manager?: ExchangeManager) {
    // Crypto is created internally if not injected. This keeps the engine
    // usable in unit tests with a mock and ensures the Master Key load
    // happens at engine construction time (fail-fast on missing env).
    this.crypto = crypto ?? new ExchangeEngineCrypto();
    this.manager = manager ?? new ExchangeManager();
  }

  // ============================================================
  // Public Plaintext Methods (delegated to ExchangeManager)
  //
  // These are retained for testing and for internal calls where the
  // caller already holds the decrypted secret. New business code
  // should always use *Encrypted methods.
  // ============================================================

  /**
   * Validates API Key and Secret by attempting a lightweight API fetch.
   * Plaintext-only.
   */
  async testConnection(
    exchange: ExchangeName,
    apiKey: string,
    apiSecret: string
  ): Promise<boolean> {
    return this.manager.testConnection(exchange, apiKey, apiSecret);
  }

  async fetchBalance(
    exchange: ExchangeName,
    apiKey: string,
    apiSecret: string
  ): Promise<ExchangeBalance> {
    return this.manager.fetchBalance(exchange, apiKey, apiSecret);
  }

  async fetchPairs(exchange: ExchangeName): Promise<string[]> {
    return this.manager.fetchPairs(exchange);
  }

  async fetchTicker(exchange: ExchangeName, pair: string): Promise<MarketTicker> {
    return this.manager.fetchTicker(exchange, pair);
  }

  async fetchOHLCV(
    exchange: ExchangeName,
    pair: string,
    timeframe: string = '1h',
    limit: number = 100
  ): Promise<Candlestick[]> {
    return this.manager.fetchOHLCV(exchange, pair, timeframe, limit);
  }

  async fetchOrderBook(
    exchange: ExchangeName,
    pair: string,
    limit: number = 20
  ): Promise<OrderBook> {
    return this.manager.fetchOrderBook(exchange, pair, limit);
  }

  async executeOrder(
    exchange: ExchangeName,
    apiKey: string,
    apiSecret: string,
    params: OrderExecutionParams
  ): Promise<ExecutionOrderResult> {
    return this.manager.executeOrder(exchange, apiKey, apiSecret, params);
  }

  async fetchOrder(
    exchange: ExchangeName,
    apiKey: string,
    apiSecret: string,
    id: string,
    symbol: string
  ): Promise<ExecutionOrderResult> {
    return this.manager.fetchOrder(exchange, apiKey, apiSecret, id, symbol);
  }

  async cancelOrder(
    exchange: ExchangeName,
    apiKey: string,
    apiSecret: string,
    id: string,
    symbol: string
  ): Promise<boolean> {
    return this.manager.cancelOrder(exchange, apiKey, apiSecret, id, symbol);
  }

  // ============================================================
  // Public *Encrypted Methods — PREFERRED for all business callers
  //
  // These accept the ciphertext blob + keyVersion and decrypt internally.
  // The plaintext is used only within this method scope, for the exchange
  // request, and is never returned, logged, or passed back to the caller.
  // Per Secret Ownership Rule #5, ONLY this Engine may decrypt.
  // ============================================================

  async fetchBalanceEncrypted(
    exchange: ExchangeName,
    encryptedApiKey: string,
    encryptedApiSecret: string,
    context?: DecryptContext
  ): Promise<ExchangeBalance> {
    const apiKey = this.crypto.decrypt(encryptedApiKey, context);
    const apiSecret = this.crypto.decrypt(encryptedApiSecret, context);
    return this.fetchBalance(exchange, apiKey, apiSecret);
  }

  async testConnectionEncrypted(
    exchange: ExchangeName,
    encryptedApiKey: string,
    encryptedApiSecret: string,
    context?: DecryptContext
  ): Promise<boolean> {
    const apiKey = this.crypto.decrypt(encryptedApiKey, context);
    const apiSecret = this.crypto.decrypt(encryptedApiSecret, context);
    return this.testConnection(exchange, apiKey, apiSecret);
  }

  async executeOrderEncrypted(params: OrderExecutionParamsEncrypted): Promise<ExecutionOrderResult> {
    const apiKey = this.crypto.decrypt(params.encryptedApiKey, params.context);
    const apiSecret = this.crypto.decrypt(params.encryptedApiSecret, params.context);
    return this.manager.executeOrder(params.exchange, apiKey, apiSecret, {
      symbol: params.symbol,
      side: params.side,
      amount: params.amount,
      price: params.price,
      type: params.type,
      clientOrderId: params.clientOrderId,
    });
  }

  async fetchOrderEncrypted(
    exchange: ExchangeName,
    encryptedApiKey: string,
    encryptedApiSecret: string,
    id: string,
    symbol: string,
    context?: DecryptContext
  ): Promise<ExecutionOrderResult> {
    const apiKey = this.crypto.decrypt(encryptedApiKey, context);
    const apiSecret = this.crypto.decrypt(encryptedApiSecret, context);
    return this.fetchOrder(exchange, apiKey, apiSecret, id, symbol);
  }

  async cancelOrderEncrypted(
    exchange: ExchangeName,
    encryptedApiKey: string,
    encryptedApiSecret: string,
    id: string,
    symbol: string,
    context?: DecryptContext
  ): Promise<boolean> {
    const apiKey = this.crypto.decrypt(encryptedApiKey, context);
    const apiSecret = this.crypto.decrypt(encryptedApiSecret, context);
    return this.cancelOrder(exchange, apiKey, apiSecret, id, symbol);
  }

  /**
   * Encrypts a pair of API credentials for at-rest storage. Returns the
   * ciphertext blobs + their keyVersions ready to be written to the DB.
   *
   * Encryption is safe to expose to API services — the Master Key never
   * leaves this Engine, and the resulting ciphertext is useless without it.
   * Decryption, however, must only happen inside this Engine's *Encrypted
   * methods (see Secret Ownership Rule #5).
   */
  encryptCredentials(apiKey: string, apiSecret: string): {
    apiKeyEncrypted: string;
    apiKeyKeyVersion: number;
    apiSecretEncrypted: string;
    apiSecretKeyVersion: number;
  } {
    return {
      apiKeyEncrypted: this.crypto.encrypt(apiKey),
      apiKeyKeyVersion: this.crypto.getCurrentKeyVersion(),
      apiSecretEncrypted: this.crypto.encrypt(apiSecret),
      apiSecretKeyVersion: this.crypto.getCurrentKeyVersion(),
    };
  }
}
