export interface ExchangeBalanceItem {
    asset: string;
    free: number;
    used: number;
    total: number;
}
export interface ExchangeBalance {
    exchange: string;
    balances: ExchangeBalanceItem[];
    timestamp: number;
}
export interface MarketTicker {
    symbol: string;
    last: number;
    high: number;
    low: number;
    volume: number;
    change24hPercent: number;
    bid: number;
    ask: number;
    timestamp: number;
}
export interface Candlestick {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}
export interface OrderBookEntry {
    price: number;
    amount: number;
}
export interface OrderBook {
    symbol: string;
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
    timestamp: number;
}
export interface OrderExecutionParams {
    exchange: 'binance' | 'bybit';
    apiKey: string;
    apiSecret: string;
    symbol: string;
    side: 'buy' | 'sell';
    amount: number;
    price?: number;
    type?: 'market' | 'limit';
    clientOrderId: string;
}
export interface ExecutionOrderResult {
    id: string;
    clientOrderId: string;
    symbol: string;
    side: 'buy' | 'sell';
    status: 'closed' | 'open' | 'canceled';
    executedPrice: number;
    amount: number;
    filled: number;
    remaining: number;
    fee: number;
    feeAsset: string;
    timestamp: number;
}
export declare class ExchangeEngine {
    private createCcxtClient;
    testConnection(exchange: 'binance' | 'bybit', apiKey: string, apiSecret: string): Promise<boolean>;
    fetchBalance(exchange: 'binance' | 'bybit', apiKey: string, apiSecret: string): Promise<ExchangeBalance>;
    fetchPairs(exchange: 'binance' | 'bybit'): Promise<string[]>;
    fetchTicker(exchange: 'binance' | 'bybit', pair: string): Promise<MarketTicker>;
    fetchOHLCV(exchange: 'binance' | 'bybit', pair: string, timeframe?: string, limit?: number): Promise<Candlestick[]>;
    fetchOrderBook(exchange: 'binance' | 'bybit', pair: string, limit?: number): Promise<OrderBook>;
    executeOrder(params: OrderExecutionParams): Promise<ExecutionOrderResult>;
    fetchOrder(exchange: 'binance' | 'bybit', apiKey: string, apiSecret: string, id: string, symbol: string): Promise<ExecutionOrderResult>;
    cancelOrder(exchange: 'binance' | 'bybit', apiKey: string, apiSecret: string, id: string, symbol: string): Promise<boolean>;
}
//# sourceMappingURL=index.d.ts.map