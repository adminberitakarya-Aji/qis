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
    - Volume Analysis (Volume Trend, Volume-Price Correlation)
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
            "volume_24h": 0.0,
            "volume_trend": "neutral",
            "volume_price_correlation": 0.0,
        }

    df = pd.DataFrame(candles)
    df["close"] = df["close"].astype(float)
    df["high"] = df["high"].astype(float)
    df["low"] = df["low"].astype(float)
    df["open"] = df["open"].astype(float)
    df["volume"] = df["volume"].astype(float)

    # Calculate 24h volume (sum of last 24 candles)
    last_24_vol = df.tail(min(24, len(df)))["volume"].sum()
    volume_24h = float(last_24_vol)

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

    # 6. Volume Analysis
    # Volume Trend: Compare recent volume to average
    recent_volume = df.tail(6)["volume"].mean()  # Last 6 hours
    avg_volume = df["volume"].mean()  # Full period average
    if avg_volume > 0:
        volume_ratio = recent_volume / avg_volume
        if volume_ratio > 1.5:
            volume_trend = "increasing"
        elif volume_ratio < 0.7:
            volume_trend = "decreasing"
        else:
            volume_trend = "neutral"
    else:
        volume_trend = "neutral"
    
    # Volume-Price Correlation (last 24 periods)
    last_24_vol_series = df.tail(min(24, len(df)))["volume"]
    last_24_price_series = df.tail(min(24, len(df)))["close"]
    if len(last_24_vol_series) > 10 and last_24_vol_series.std() > 0 and last_24_price_series.std() > 0:
        volume_price_corr = float(last_24_vol_series.corr(last_24_price_series))
    else:
        volume_price_corr = 0.0

    # 7. Grid Suitability Score Calculation (0 - 100)
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

    # Volume Component: Healthy volume supports grid execution
    if volume_trend == "increasing":
        score += 5.0  # Growing interest
    elif volume_trend == "decreasing":
        score -= 5.0  # Waning interest

    # Volume-Price Correlation: Positive correlation in uptrend = healthy
    if trend == "uptrend" and volume_price_corr > 0.3:
        score += 3.0
    elif trend == "downtrend" and volume_price_corr < -0.3:
        score += 3.0  # Volume confirms downtrend
    elif abs(volume_price_corr) < 0.1:
        score += 2.0  # Low correlation in sideways = healthy chop

    final_score = float(max(50.0, min(98.0, score)))

    return {
        "rsi_14": round(current_rsi, 2),
        "bb_bandwidth_percent": round(current_bb_width, 2),
        "atr_percent": round(current_atr_pct, 2),
        "volatility_24h_percent": round(range_spread_pct, 2),
        "is_sideways": is_sideways,
        "trend": trend,
        "grid_suitability_score": round(final_score, 1),
        "volume_24h": round(volume_24h, 2),
        "volume_trend": volume_trend,
        "volume_price_correlation": round(volume_price_corr, 3),
    }
