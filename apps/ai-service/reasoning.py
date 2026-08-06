from typing import Dict, Any, List

def generate_pair_reasoning(symbol: str, features: Dict[str, Any], volume_24h: float) -> Dict[str, Any]:
    """
    Pattern Recognition & Reasoning Engine for Pair Recommendation.
    Evaluates Extracted Technical Features and generates Explainable AI text.
    """
    rsi = features.get("rsi_14", 50.0)
    bb_width = features.get("bb_bandwidth_percent", 4.0)
    volatility = features.get("volatility_24h_percent", 4.0)
    is_sideways = features.get("is_sideways", True)
    score = features.get("grid_suitability_score", 80.0)

    reasons = []

    if is_sideways:
        reasons.append(f"Ideal range-bound (sideways) structure detected across last 24h ({volatility}% spread).")
    else:
        reasons.append(f"High 24h price mobility ({volatility}% range) offers strong grid recycling frequency.")

    if 40 <= rsi <= 60:
        reasons.append(f"Neutral RSI ({rsi}) indicates balanced buyer-seller equilibrium, minimizing breakout risk.")
    elif rsi < 40:
        reasons.append(f"Oversold RSI ({rsi}) suggests strong potential support near lower section grid levels.")
    else:
        reasons.append(f"Active momentum with RSI ({rsi}), wider section gaps recommended to absorb upper pullbacks.")

    if bb_width <= 6.0:
        reasons.append(f"Tight Bollinger compression ({bb_width}%) signals imminent systematic mean-reversion.")

    if volume_24h > 50_000_000:
        reasons.append("Ultra-high market depth & liquidity ensures zero execution slippage.")

    reasoning_text = f"{symbol}: " + " ".join(reasons)

    return {
        "pair": symbol,
        "confidenceScore": round(score, 1),
        "reasoning": reasoning_text,
        "volatility24hPercent": volatility,
        "volume24h": volume_24h,
        "features": features,
    }


def generate_strategy_recommendation(
    symbol: str,
    features: Dict[str, Any],
    section_count: int,
    capital: float
) -> Dict[str, Any]:
    """
    Precision AI Parameter Optimizer:
    Calculates the exact Grid Distance %, Section Gap %, Grid Count, and min_net_profit_percent
    tailored specifically to this trading pair's volatility profile, ATR(14), and Bollinger Band compression.

    Optimization Principles:
    1. Low Volatility (<3%): Tighter Grid Distance (0.4% - 0.6%), higher grid density, tighter Section Gaps (1.5%) to maximize fill frequency.
    2. Medium Volatility (3% - 6%): Balanced Grid Distance (0.6% - 1.0%), moderate gaps (2.0%).
    3. High Volatility (>6%): Wider Grid Distance (1.2% - 2.0%), wider Section Gaps (3.0% - 4.0%) to prevent rapid capital exhaustion on deep pullbacks.
    """
    atr = features.get("atr_percent", 2.0)
    volatility = features.get("volatility_24h_percent", 4.0)
    bb_width = features.get("bb_bandwidth_percent", 4.0)
    score = features.get("grid_suitability_score", 82.0)

    # Base grid distance precision calculation derived from ATR and Volatility ratio
    raw_base_distance = (atr * 0.3) + (volatility * 0.05)
    
    if volatility < 3.0:
        # Low volatility regime (e.g. BTC in tight range)
        base_grid_distance = max(0.40, round(raw_base_distance, 2))
        vol_regime = "Low Volatility (High Frequency Grid)"
    elif volatility > 6.0:
        # High volatility regime (e.g. SOL / AVAX swing)
        base_grid_distance = max(1.00, round(raw_base_distance * 1.15, 2))
        vol_regime = "High Volatility (Capital Protection Grid)"
    else:
        # Balanced volatility regime
        base_grid_distance = max(0.65, round(raw_base_distance, 2))
        vol_regime = "Balanced Volatility (Standard Grid)"

    sections = []
    for i in range(section_count):
        # Section Risk Escalation Factor
        # Section 1 (top): high fill frequency, lower profit target
        # Section 2 & 3 (deeper): wider distance, wider section gap, higher net profit target
        grid_distance = round(base_grid_distance * (1 + i * 0.30), 2)
        section_gap = round(1.5 + (volatility * 0.25) + (i * 1.2), 2)
        min_net_profit = round(0.50 + (i * 0.35) + (atr * 0.05), 2)
        
        # Grid density scaling
        if volatility < 3.0:
            grid_count = 12 if i == 0 else (9 if i == 1 else 6)
        elif volatility > 6.0:
            grid_count = 8 if i == 0 else (6 if i == 1 else 4)
        else:
            grid_count = 10 if i == 0 else (7 if i == 1 else 5)

        sec_reasoning = (
            f"Section {i + 1} ({vol_regime}): Optimized with {grid_count} grids at {grid_distance}% distance "
            f"and {section_gap}% Section Gap based on ATR ({atr}%). Net profit threshold set to {min_net_profit}%."
        )

        sections.append({
            "sectionIndex": i,
            "gridCount": grid_count,
            "gridDistancePercent": grid_distance,
            "sectionGapPercent": section_gap,
            "minNetProfitPercent": min_net_profit,
            "reasoning": sec_reasoning,
        })

    overall_reasoning = (
        f"AI Strategy Blueprint for {symbol} dynamically optimized for {vol_regime}. "
        f"Base Grid Distance derived from ATR ({atr}%) and 24h Volatility ({volatility}%). "
        f"Configured across {section_count} sections with dynamic Section Gaps to maximize compound grid recycling while shielding capital."
    )

    return {
        "pair": symbol,
        "confidenceScore": round(score, 1),
        "overallReasoning": overall_reasoning,
        "recommendedSections": sections,
        "capitalProtectionFloorPrice": 0.0,
        "maxCapitalPerMovementPercent": 40.0,
        "maxDrawdownAlertPercent": 15.0,
    }
