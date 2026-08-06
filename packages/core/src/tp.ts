// Qis Take Profit Calculation
// TP is calculated from the actual executed price (not the grid level).
// TP_Price = Buy_Executed_Price × (1 + min_net_profit% + buy_fee% + sell_fee% + est_slippage%)

export interface TpCalculationParams {
  buyExecutedPrice: number;
  minNetProfitPercent: number;
  buyFeePercent: number;
  sellFeePercent: number;
  estimatedSlippagePercent: number;
}

/**
 * Calculates the Take Profit price for a grid order.
 *
 * The TP is derived from the actual executed market price,
 * not the grid level price.
 */
export function calculateTpPrice(params: TpCalculationParams): number {
  const {
    buyExecutedPrice,
    minNetProfitPercent,
    buyFeePercent,
    sellFeePercent,
    estimatedSlippagePercent,
  } = params;

  const totalBufferPercent = minNetProfitPercent + buyFeePercent + sellFeePercent + estimatedSlippagePercent;

  return buyExecutedPrice * (1 + totalBufferPercent / 100);
}

/**
 * Verifies that selling at the given price yields at least the minimum net profit
 * after deducting buy fee, sell fee, and estimated slippage.
 *
 * Returns the net profit percentage achieved.
 */
export function calculateNetProfitPercent(params: {
  buyExecutedPrice: number;
  sellPrice: number;
  buyFeePercent: number;
  sellFeePercent: number;
}): number {
  const { buyExecutedPrice, sellPrice, buyFeePercent, sellFeePercent } = params;

  const buyCost = buyExecutedPrice * (1 + buyFeePercent / 100);
  const sellProceeds = sellPrice * (1 - sellFeePercent / 100);

  return ((sellProceeds - buyCost) / buyCost) * 100;
}

/**
 * Checks whether a sell price meets the minimum net profit requirement.
 */
export function meetsMinNetProfit(params: {
  buyExecutedPrice: number;
  sellPrice: number;
  minNetProfitPercent: number;
  buyFeePercent: number;
  sellFeePercent: number;
}): boolean {
  const { buyExecutedPrice, sellPrice, minNetProfitPercent, buyFeePercent, sellFeePercent } = params;

  const netProfitPercent = calculateNetProfitPercent({
    buyExecutedPrice,
    sellPrice,
    buyFeePercent,
    sellFeePercent,
  });

  return netProfitPercent >= minNetProfitPercent;
}