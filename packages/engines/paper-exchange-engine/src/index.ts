// Qis Paper Exchange Engine
// Simulates exchange order execution against a virtual balance.
// No real API calls, no API keys, no real money.
// Uses live market prices from the Worker for realistic fills.

export interface PaperFillResult {
  filledPrice: number;
  filledQuantity: number;
  fee: number;
  realizedPnl?: number;
}

export class PaperExchangeEngine {
  private readonly buyFeePercent = 0.1; // 0.1% — matches real Binance spot
  private readonly sellFeePercent = 0.1; // 0.1%
  private readonly slippagePercent = 0.05; // 0.05% — matches backtest default

  /**
   * Simulates a MARKET BUY fill.
   * - Buy executes at triggeredPrice + slippage
   * - Virtual capital is reserved upfront by startPaperExecution
   */
  simulateMarketBuy(
    allocatedCapital: number,
    triggeredPrice: number,
  ): PaperFillResult {
    const filledPrice = triggeredPrice * (1 + this.slippagePercent / 100);
    const filledQuantity = allocatedCapital / filledPrice;
    const fee = allocatedCapital * (this.buyFeePercent / 100);

    return {
      filledPrice: Number(filledPrice.toFixed(8)),
      filledQuantity: Number(filledQuantity.toFixed(8)),
      fee: Number(fee.toFixed(6)),
    };
  }

  /**
   * Simulates a TP SELL LIMIT fill.
   * - Sell executes at tpPrice - slippage
   * - Proceeds minus fee are added back to virtual balance (done by caller)
   * - Calculates realized PnL
   */
  simulateTpSell(
    filledQuantity: number,
    buyFilledPrice: number,
    buyFee: number,
    tpPrice: number,
  ): PaperFillResult {
    const sellPrice = tpPrice * (1 - this.slippagePercent / 100);
    const sellProceeds = filledQuantity * sellPrice;
    const sellFee = sellProceeds * (this.sellFeePercent / 100);
    const buyCost = filledQuantity * buyFilledPrice + buyFee;
    const realizedPnl = sellProceeds - sellFee - buyCost;

    return {
      filledPrice: Number(sellPrice.toFixed(8)),
      filledQuantity,
      fee: Number(sellFee.toFixed(6)),
      realizedPnl: Number(realizedPnl.toFixed(6)),
    };
  }

  /**
   * Simulates a MARKET SELL fill (for settling an open position when a paper strategy is stopped).
   * - Sell executes at currentMarketPrice - slippage
   * - Proceeds minus fee are calculated to be returned to virtual balance
   * - Calculates realized PnL against original buy cost
   */
  simulateMarketSell(
    filledQuantity: number,
    buyFilledPrice: number,
    buyFee: number,
    currentMarketPrice: number,
  ): PaperFillResult {
    const sellPrice = currentMarketPrice * (1 - this.slippagePercent / 100);
    const sellProceeds = filledQuantity * sellPrice;
    const sellFee = sellProceeds * (this.sellFeePercent / 100);
    const buyCost = filledQuantity * buyFilledPrice + buyFee;
    const realizedPnl = sellProceeds - sellFee - buyCost;

    return {
      filledPrice: Number(sellPrice.toFixed(8)),
      filledQuantity,
      fee: Number(sellFee.toFixed(6)),
      realizedPnl: Number(realizedPnl.toFixed(6)),
    };
  }
}