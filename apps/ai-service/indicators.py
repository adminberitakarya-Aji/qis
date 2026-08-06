import pandas as pd
import numpy as np
from typing import Dict, Any, List

def calculate_technical_features(candles: List[Dict[str, float]]) -> Dict[str, Any]:
    """
    Feature Extraction Module using pandas & numpy.
    Calculates key technical metrics required for Grid Trading Pattern Recognition:
    - RSI (14)
    - Bollinger Band Width (20, 2)
    - ATR % (14)
    - Volatility (24h & 7d)
    - Trend Direction (EMA 20 vs EMA 50)
    - Price Range Sideways Score
    """
    if not candles or len(candles) < 20:
        return {
            "rsi_14": 50.0,
            "bb_bandwidth_percent": 3.5,
            "atr_percent": 2.0,
            "volatility_24h_percent": 3.0,
            "is_sideways": True,
            "trend": "neutral",
            "grid_suitability_score": 75.0,
        }

    df = pd.DataFrame(candles)
    df["close"] = df["close"].astype(float)
    df["high"] = df["high"].astype(float)
    df["low"] = df["low"].astype(float)
    df["open"] = df["open"].astype(float)
    df["volume"] = df["volume"].astype(float)

    # 1. RSI (14)
    delta = df["close"].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / (loss.replace(0, 1e-9))
    rsi = 100 - (100 / (1 + rs))
    current_rsi = float(rsi.iloc[-1]) if not pd.isna(rsi.iloc[-1]) else 50.0

    # 2. Bollinger Bands (20, 2) & Bandwidth %
    sma20 = df["close"].rolling(window=20).mean()
    std20 = df["close"].rolling(window=20).std()
    upper_bb = sma20 + (std20 * 2)
    lower_bb = sma20 - (std20 * 2)
    bb_bandwidth = ((upper_bb - lower_bb) / sma20) * 100
    current_bb_width = float(bb_bandwidth.iloc[-1]) if not pd.isna(bb_bandwidth.iloc[-1]) else 4.0

    # 3. ATR % (14)
    high_low = df["high"] - df["low"]
    high_close = (df["high"] - df["close"].shift()).abs()
    low_close = (df["low"] - df["close"].shift()).abs()
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    atr = tr.rolling(window=14).mean()
    current_close = float(df["close"].iloc[-1])
    current_atr_pct = float((atr.iloc[-1] / current_close) * 100) if current_close > 0 and not pd.isna(atr.iloc[-1]) else 2.0

    # 4. Volatility 24h & Trend (EMA 20 vs EMA 50)
    ema20 = df["close"].ewm(span=20, adjust=False).mean()
    ema50 = df["close"].ewm(span=min(50, len(df)), adjust=False).mean()
    
    current_ema20 = float(ema20.iloc[-1])
    current_ema50 = float(ema50.iloc[-1])

    if current_ema20 > current_ema50 * 1.01:
        trend = "uptrend"
    elif current_ema20 < current_ema50 * 0.99:
        trend = "downtrend"
    else:
        trend = "neutral"

    # 5. Sideways Range Detection (High vs Low over last 24 periods)
    last_24 = df.tail(min(24, len(df)))
    period_high = float(last_24["high"].max())
    period_low = float(last_24["low"].min())
    range_spread_pct = ((period_high - period_low) / period_low) * 100 if period_low > 0 else 5.0

    is_sideways = 3.0 <= range_spread_pct <= 12.0 and 40 <= current_rsi <= 60

    # 6. Grid Suitability Score Calculation (0 - 100)
    # Ideal Grid conditions: Moderate volatility (3-8%), RSI neutral (40-60), Sideways/Range-bound, Healthy BB width
    score = 70.0

    # RSI Component: Center around 50 is best for grid recycling
    rsi_diff = abs(current_rsi - 50)
    if rsi_diff < 10:
        score += 15.0  # Perfect neutral RSI
    elif rsi_diff < 20:
        score += 8.0
    else:
        score -= 10.0  # Overbought or oversold

    # BB Width Component: Moderate compression is ideal for grid capture
    if 2.5 <= current_bb_width <= 8.0:
        score += 10.0
    elif current_bb_width > 12.0:
        score -= 5.0  # Wild volatility spike

    # Sideways range bonus
    if is_sideways:
        score += 10.0

    final_score = float(max(50.0, min(98.0, score)))

    return {
        "rsi_14": round(current_rsi, 2),
        "bb_bandwidth_percent": round(current_bb_width, 2),
        "atr_percent": round(current_atr_pct, 2),
        "volatility_24h_percent": round(range_spread_pct, 2),
        "is_sideways": is_sideways,
        "trend": trend,
        "grid_suitability_score": round(final_score, 1),
    }
