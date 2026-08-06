import ccxt from 'ccxt';
export class ExchangeEngine {
    createCcxtClient(exchangeName, apiKey, apiSecret) {
        const norm = exchangeName.toLowerCase();
        const config = {
            enableRateLimit: true,
            options: {
                defaultType: 'spot',
            },
        };
        if (apiKey && apiSecret) {
            config.apiKey = apiKey;
            config.secret = apiSecret;
        }
        if (norm === 'binance') {
            return new ccxt.binance(config);
        }
        else if (norm === 'bybit') {
            return new ccxt.bybit(config);
        }
        else {
            throw new Error(`Unsupported exchange: ${exchangeName}`);
        }
    }
    async testConnection(exchange, apiKey, apiSecret) {
        try {
            const client = this.createCcxtClient(exchange, apiKey, apiSecret);
            await client.fetchBalance();
            return true;
        }
        catch (error) {
            console.error(`[ExchangeEngine] Connection test failed for ${exchange}:`, error.message);
            return false;
        }
    }
    async fetchBalance(exchange, apiKey, apiSecret) {
        const client = this.createCcxtClient(exchange, apiKey, apiSecret);
        const balanceResponse = await client.fetchBalance();
        const balances = [];
        if (balanceResponse.total) {
            for (const [asset, totalVal] of Object.entries(balanceResponse.total)) {
                const total = typeof totalVal === 'number' ? totalVal : 0;
                if (total > 0) {
                    const freeVal = balanceResponse.free?.[asset];
                    const usedVal = balanceResponse.used?.[asset];
                    const free = typeof freeVal === 'number' ? freeVal : 0;
                    const used = typeof usedVal === 'number' ? usedVal : 0;
                    balances.push({
                        asset,
                        free,
                        used,
                        total,
                    });
                }
            }
        }
        return {
            exchange,
            balances,
            timestamp: Date.now(),
        };
    }
    async fetchPairs(exchange) {
        const client = this.createCcxtClient(exchange);
        const markets = await client.loadMarkets();
        return Object.values(markets)
            .filter((m) => m && m.spot && m.active)
            .map((m) => m.symbol);
    }
    async fetchTicker(exchange, pair) {
        const client = this.createCcxtClient(exchange);
        const ticker = await client.fetchTicker(pair);
        return {
            symbol: pair,
            last: ticker.last ?? 0,
            high: ticker.high ?? 0,
            low: ticker.low ?? 0,
            volume: ticker.baseVolume ?? 0,
            change24hPercent: ticker.percentage ?? 0,
            bid: ticker.bid ?? 0,
            ask: ticker.ask ?? 0,
            timestamp: ticker.timestamp ?? Date.now(),
        };
    }
    async fetchOHLCV(exchange, pair, timeframe = '1h', limit = 100) {
        const client = this.createCcxtClient(exchange);
        const ohlcv = await client.fetchOHLCV(pair, timeframe, undefined, limit);
        return ohlcv.map((candle) => ({
            timestamp: candle[0] ?? 0,
            open: candle[1] ?? 0,
            high: candle[2] ?? 0,
            low: candle[3] ?? 0,
            close: candle[4] ?? 0,
            volume: candle[5] ?? 0,
        }));
    }
    async fetchOrderBook(exchange, pair, limit = 20) {
        const client = this.createCcxtClient(exchange);
        const orderbook = await client.fetchOrderBook(pair, limit);
        return {
            symbol: pair,
            bids: (orderbook.bids || []).map((entry) => ({ price: entry[0], amount: entry[1] })),
            asks: (orderbook.asks || []).map((entry) => ({ price: entry[0], amount: entry[1] })),
            timestamp: orderbook.timestamp ?? Date.now(),
        };
    }
    async executeOrder(params) {
        const { exchange, apiKey, apiSecret, symbol, side, amount, price, type = 'market', clientOrderId } = params;
        const client = this.createCcxtClient(exchange, apiKey, apiSecret);
        const order = await client.createOrder(symbol, type, side, amount, type === 'limit' ? price : undefined, { clientOrderId });
        const executedPrice = order.average ?? order.price ?? price ?? 0;
        const feeCost = order.fee?.cost ?? 0;
        const feeCurrency = order.fee?.currency ?? '';
        return {
            id: order.id,
            clientOrderId: order.clientOrderId || clientOrderId,
            symbol,
            side,
            status: order.status || (type === 'limit' ? 'open' : 'closed'),
            executedPrice,
            amount: order.amount ?? amount,
            filled: order.filled ?? (type === 'market' ? amount : 0),
            remaining: order.remaining ?? (type === 'market' ? 0 : amount),
            fee: feeCost,
            feeAsset: feeCurrency,
            timestamp: order.timestamp ?? Date.now(),
        };
    }
    async fetchOrder(exchange, apiKey, apiSecret, id, symbol) {
        const client = this.createCcxtClient(exchange, apiKey, apiSecret);
        const order = await client.fetchOrder(id, symbol);
        return {
            id: order.id,
            clientOrderId: order.clientOrderId || id,
            symbol,
            side: order.side,
            status: order.status || 'open',
            executedPrice: order.average ?? order.price ?? 0,
            amount: order.amount ?? 0,
            filled: order.filled ?? 0,
            remaining: order.remaining ?? 0,
            fee: order.fee?.cost ?? 0,
            feeAsset: order.fee?.currency ?? '',
            timestamp: order.timestamp ?? Date.now(),
        };
    }
    async cancelOrder(exchange, apiKey, apiSecret, id, symbol) {
        try {
            const client = this.createCcxtClient(exchange, apiKey, apiSecret);
            await client.cancelOrder(id, symbol);
            return true;
        }
        catch (error) {
            console.error(`[ExchangeEngine] Failed to cancel order ${id}:`, error.message);
            return false;
        }
    }
}
//# sourceMappingURL=index.js.map