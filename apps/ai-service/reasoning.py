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


def calculate_capital_protection_floor(
    current_price: float,
    ai_recommended_floor: float,
    volatility: float
) -> float:
    """
    Calculates the Capital Protection Floor dynamically.
    
    Priority:
    1. Use AI-recommended floor price if provided (> 0 and < current_price)
    2. Fallback: dynamic calculation based on current price and volatility
       (instead of hardcoded 85% of lowest grid price)
    
    This mirrors the TypeScript StrategyEngine's calculateCapitalProtectionFloor method.
    """
    # AI recommendation takes priority if valid
    if ai_recommended_floor and ai_recommended_floor > 0 and ai_recommended_floor < current_price:
        return round(ai_recommended_floor, 6)
    
    # Dynamic fallback: floor is below current price by a volatility-adjusted margin.
    # Wider volatility → deeper floor distance to avoid premature triggering.
    volatility_factor = max(0.15, min(0.35, volatility / 25.0))
    floor_distance = current_price * volatility_factor
    return round(current_price - floor_distance, 6)


def calculate_max_capital_per_movement(volatility: float, risk_score: float) -> float:
    """
    AI-recommended maximum capital exposure per price movement.
    
    Based on:
    - Volatility: Higher volatility → lower max capital per movement
    - Risk score: Derived from grid suitability score (inverse relationship)
    
    Returns a percentage (e.g., 40.0 means 40% of capital)
    """
    # Base allocation starts at 40% (conservative default)
    base_percent = 40.0
    
    # Adjust based on volatility (higher volatility = more conservative)
    if volatility > 6.0:
        vol_adjustment = -10.0  # High volatility: reduce to 30%
    elif volatility < 3.0:
        vol_adjustment = 5.0   # Low volatility: increase to 45%
    else:
        vol_adjustment = 0.0   # Medium volatility: keep at 40%
    
    # Adjust based on risk score (higher score = more confidence = slightly more aggressive)
    # risk_score is typically 50-98 from grid_suitability_score
    risk_adjustment = (risk_score - 70.0) * 0.1  # +/- ~3% adjustment
    
    max_percent = base_percent + vol_adjustment + risk_adjustment
    
    # Clamp between reasonable bounds (25% - 50%)
    return round(max(25.0, min(50.0, max_percent)), 1)


def calculate_max_drawdown_alert(volatility: float, atr_percent: float) -> float:
    """
    AI-recommended maximum drawdown alert threshold.
    
    Based on:
    - Volatility: Higher volatility → wider alert threshold to avoid false alarms
    - ATR %: Higher ATR → wider threshold
    
    Returns a percentage (e.g., 15.0 means alert at 15% drawdown)
    """
    # Base alert at 15%
    base_percent = 15.0
    
    # Adjust based on volatility (higher volatility = wider threshold)
    if volatility > 6.0:
        vol_adjustment = 5.0   # High volatility: alert at 20%
    elif volatility < 3.0:
        vol_adjustment = -3.0  # Low volatility: alert at 12%
    else:
        vol_adjustment = 0.0   # Medium volatility: keep at 15%
    
    # Adjust based on ATR (higher ATR = wider threshold)
    atr_adjustment = atr_percent * 0.5  # Add half of ATR% as buffer
    
    max_dd = base_percent + vol_adjustment + atr_adjustment
    
    # Clamp between reasonable bounds (8% - 25%)
    return round(max(8.0, min(25.0, max_dd)), 1)


def generate_strategy_recommendation(
    symbol: str,
    features: Dict[str, Any],
    section_count: int,
    capital: float,
    min_notional: float = 10.0,
) -> Dict[str, Any]:
    """
    Precision AI Parameter Optimizer:
    Calculates the exact Grid Distance %, Section Gap %, Grid Count, and min_net_profit_percent
    tailored specifically to this trading pair's volatility profile, ATR(14), and Bollinger Band compression.

    Optimization Principles:
    1. Low Volatility (<3%): Tighter Grid Distance (0.4% - 0.6%), higher grid density, tighter Section Gaps (1.5%) to maximize fill frequency.
    2. Medium Volatility (3% - 6%): Balanced Grid Distance (0.6% - 1.0%), moderate gaps (2.0%).
    3. High Volatility (>6%): Wider Grid Distance (1.2% - 2.0%), wider Section Gaps (3.0% - 4.0%) to prevent rapid capital exhaustion on deep pullbacks.

    Capital-Aware Grid Sizing:
    Grid density is capped so that every grid order's allocated capital stays
    comfortably above the exchange's minimum order notional (see get_min_notional
    in main.py). Without this, a small account (e.g. $100) could be handed a
    grid count sized for a large account, producing per-order sizes that would
    be rejected by the exchange (Binance NOTIONAL/MIN_NOTIONAL filter) — a
    strategy that looks great in Paper Trading but can't actually execute live.
    A SAFETY_MARGIN above the raw exchange minimum absorbs price movement
    between blueprint calculation and actual fill.
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

    # Default capital allocation per section — MUST stay in sync with
    # packages/engines/strategy-engine/src/index.ts's `allocations` defaults,
    # since that's what actually splits `capital` across sections at execution
    # time. If those defaults change, update DEFAULT_ALLOCATIONS to match.
    DEFAULT_ALLOCATIONS = {1: [100.0], 2: [50.0, 50.0], 3: [35.0, 35.0, 30.0]}
    allocations = DEFAULT_ALLOCATIONS.get(section_count) or [
        round(100.0 / section_count, 2) for _ in range(section_count)
    ]

    SAFETY_MARGIN = 1.5  # require capitalPerOrder >= min_notional * this
    MIN_VIABLE_GRIDS_PER_SECTION = 2  # below this, a section isn't a meaningful grid

    capital_constrained = False
    underfunded_sections: List[int] = []

    sections = []
    for i in range(section_count):
        # Section Risk Escalation Factor
        # Section 1 (top): high fill frequency, lower profit target
        # Section 2 & 3 (deeper): wider distance, wider section gap, higher net profit target
        grid_distance = round(base_grid_distance * (1 + i * 0.30), 2)
        section_gap = round(1.5 + (volatility * 0.25) + (i * 1.2), 2)
        min_net_profit = round(0.50 + (i * 0.35) + (atr * 0.05), 2)
        
        # Grid density scaling — this is the "ideal" density for the volatility
        # regime, before capital constraints are applied below.
        if volatility < 3.0:
            ideal_grid_count = 12 if i == 0 else (9 if i == 1 else 6)
        elif volatility > 6.0:
            ideal_grid_count = 8 if i == 0 else (6 if i == 1 else 4)
        else:
            ideal_grid_count = 10 if i == 0 else (7 if i == 1 else 5)

        # Capital-aware cap: how many grids can this section actually fund
        # while keeping each order's notional safely above the exchange minimum?
        section_capital = capital * (allocations[i] / 100.0)
        max_viable_grids = int(section_capital // (min_notional * SAFETY_MARGIN))

        if max_viable_grids >= ideal_grid_count:
            grid_count = ideal_grid_count
        elif max_viable_grids >= MIN_VIABLE_GRIDS_PER_SECTION:
            grid_count = max_viable_grids
            capital_constrained = True
        else:
            # Even the minimum viable grid count can't be safely funded.
            grid_count = MIN_VIABLE_GRIDS_PER_SECTION
            capital_constrained = True
            underfunded_sections.append(i + 1)

        capital_per_order = round(section_capital / grid_count, 2) if grid_count else 0.0

        if grid_count < ideal_grid_count:
            sec_reasoning = (
                f"Section {i + 1} ({vol_regime}): grid count reduced from {ideal_grid_count} to {grid_count} "
                f"to keep each order (~${capital_per_order}) safely above the exchange's minimum order size "
                f"(${min_notional} x {SAFETY_MARGIN} safety margin). Distance {grid_distance}%, "
                f"Section Gap {section_gap}%, Net profit threshold {min_net_profit}%."
            )
        else:
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

    if underfunded_sections:
        overall_reasoning = (
            f"AI Strategy Blueprint for {symbol}: with ${capital} capital, section(s) "
            f"{', '.join(str(s) for s in underfunded_sections)} could not be funded to a safe grid density "
            f"given this pair's minimum order size (${min_notional}). Consider increasing capital or reducing "
            f"section count for a fully reliable strategy."
        )
    elif capital_constrained:
        overall_reasoning = (
            f"AI Strategy Blueprint for {symbol} dynamically optimized for {vol_regime}, then scaled down to fit "
            f"your ${capital} capital — every grid order is sized to clear the exchange's minimum order size "
            f"with a {SAFETY_MARGIN}x safety margin, so the strategy is fully executable, not just on paper."
        )
    else:
        overall_reasoning = (
            f"AI Strategy Blueprint for {symbol} dynamically optimized for {vol_regime}. "
            f"Base Grid Distance derived from ATR ({atr}%) and 24h Volatility ({volatility}%). "
            f"Configured across {section_count} sections with dynamic Section Gaps to maximize compound grid recycling while shielding capital."
        )

    # Capital Protection: AI-calculated dynamic values (not hardcoded)
    # Note: current_price is not available at this level; the AI service provides
    # the methodology, and the StrategyEngine will apply it with real-time price.
    # We set capitalProtectionFloorPrice to 0 to signal "use dynamic calculation in StrategyEngine"
    # The StrategyEngine's calculateCapitalProtectionFloor() will use:
    #   volatilityFactor = clamp(volatility / 25, 0.15, 0.35)
    #   floor = currentPrice * (1 - volatilityFactor)
    capital_protection_floor_price = 0.0  # Signal to use dynamic calculation

    max_capital_per_movement = calculate_max_capital_per_movement(volatility, score)
    max_drawdown_alert = calculate_max_drawdown_alert(volatility, atr)

    return {
        "pair": symbol,
        "confidenceScore": round(score, 1),
        "overallReasoning": overall_reasoning,
        "recommendedSections": sections,
        "capitalProtectionFloorPrice": capital_protection_floor_price,
        "maxCapitalPerMovementPercent": max_capital_per_movement,
        "maxDrawdownAlertPercent": max_drawdown_alert,
        "minNotionalUsdt": min_notional,
        "capitalConstrained": capital_constrained,
        "underfundedSections": underfunded_sections,
    }
    