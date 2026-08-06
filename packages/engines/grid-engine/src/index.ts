// Qis Grid Engine
// Responsible for:
// - Generating Grid Level Prices
// - Calculating Order Sizes per Grid Level
// - Applying Section Gap & Grid Distance Spacing
// Never analyzes market conditions.

import { calculateTpPrice } from '@qis/core';

export interface GridLevelOrder {
  sectionIndex: number;
  orderIndex: number; // Order index within section
  globalOrderIndex: number;
  gridPrice: number; // Calculated target price level
  allocatedCapitalUsdt: number;
  estimatedQuantity: number;
  minNetProfitPercent: number;
  estimatedTpPrice: number;
}

export interface GridSectionBuildResult {
  sectionIndex: number;
  allocationPercent: number;
  allocatedCapitalUsdt: number;
  gridCount: number;
  gridDistancePercent: number;
  sectionGapPercent: number;
  minNetProfitPercent: number;
  orders: GridLevelOrder[];
  topGridPrice: number;
  bottomGridPrice: number;
}

export interface GridBuildInput {
  currentPrice: number;
  totalCapital: number;
  buyFeePercent?: number; // default 0.1%
  sellFeePercent?: number; // default 0.1%
  estimatedSlippagePercent?: number; // default 0.05%
  sections: Array<{
    allocationPercent: number;
    gridCount: number;
    gridDistancePercent: number;
    sectionGapPercent: number;
    minNetProfitPercent: number;
  }>;
}

export interface GridBuildResult {
  currentPrice: number;
  totalCapital: number;
  totalOrderCount: number;
  sections: GridSectionBuildResult[];
  lowestGridPrice: number;
  highestGridPrice: number;
}

export class GridEngine {
  /**
   * Builds the complete multi-section Grid structure based on blueprint specs.
   */
  buildGrid(input: GridBuildInput): GridBuildResult {
    const {
      currentPrice,
      totalCapital,
      buyFeePercent = 0.1,
      sellFeePercent = 0.1,
      estimatedSlippagePercent = 0.05,
      sections,
    } = input;

    const sectionResults: GridSectionBuildResult[] = [];
    let currentReferencePrice = currentPrice;
    let globalOrderCounter = 0;
    let overallLowest = currentPrice;
    let overallHighest = 0;

    sections.forEach((sec, sectionIndex) => {
      const sectionCapital = (totalCapital * sec.allocationPercent) / 100;
      const capitalPerOrder = sectionCapital / sec.gridCount;
      const orders: GridLevelOrder[] = [];

      let lastPrice = currentReferencePrice;

      for (let i = 0; i < sec.gridCount; i++) {
        globalOrderCounter++;
        let orderPrice: number;

        if (i === 0) {
          if (sectionIndex === 0) {
            // First grid of section 0 is gridDistance below reference current price
            orderPrice = lastPrice * (1 - sec.gridDistancePercent / 100);
          } else {
            // First grid of deeper section is sectionGap below last order of previous section
            orderPrice = lastPrice * (1 - sec.sectionGapPercent / 100);
          }
        } else {
          // Subsequent grids in section are gridDistance below previous order
          orderPrice = lastPrice * (1 - sec.gridDistancePercent / 100);
        }

        orderPrice = Number(orderPrice.toFixed(6));
        lastPrice = orderPrice;

        if (orderPrice < overallLowest) overallLowest = orderPrice;
        if (orderPrice > overallHighest) overallHighest = orderPrice;

        const estimatedQuantity = Number((capitalPerOrder / orderPrice).toFixed(6));
        const estimatedTpPrice = calculateTpPrice({
          buyExecutedPrice: orderPrice,
          minNetProfitPercent: sec.minNetProfitPercent,
          buyFeePercent,
          sellFeePercent,
          estimatedSlippagePercent,
        });

        orders.push({
          sectionIndex,
          orderIndex: i,
          globalOrderIndex: globalOrderCounter,
          gridPrice: orderPrice,
          allocatedCapitalUsdt: Number(capitalPerOrder.toFixed(2)),
          estimatedQuantity,
          minNetProfitPercent: sec.minNetProfitPercent,
          estimatedTpPrice: Number(estimatedTpPrice.toFixed(6)),
        });
      }

      // Update reference price for next section gap calculation
      currentReferencePrice = lastPrice;

      sectionResults.push({
        sectionIndex,
        allocationPercent: sec.allocationPercent,
        allocatedCapitalUsdt: Number(sectionCapital.toFixed(2)),
        gridCount: sec.gridCount,
        gridDistancePercent: sec.gridDistancePercent,
        sectionGapPercent: sec.sectionGapPercent,
        minNetProfitPercent: sec.minNetProfitPercent,
        orders,
        topGridPrice: orders[0]?.gridPrice || 0,
        bottomGridPrice: orders[orders.length - 1]?.gridPrice || 0,
      });
    });

    return {
      currentPrice,
      totalCapital,
      totalOrderCount: globalOrderCounter,
      sections: sectionResults,
      lowestGridPrice: overallLowest,
      highestGridPrice: overallHighest,
    };
  }
}
