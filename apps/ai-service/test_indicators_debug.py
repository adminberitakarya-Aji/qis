"""
Qis AI Indicators Debug Test
Verifies CCXT actually returns candle data and that indicators compute real values.
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

import ccxt
from indicators import calculate_technical_features

def test_candles_and_indicators():
    print("=" * 60)
    print("  QIS INDICATOR LIVE DATA DEBUG TEST")
    print("=" * 60)

    exchange = ccxt.binance({"enableRateLimit": True, "options": {"defaultType": "spot"}})

    pairs_to_test = ["BTC/USDT", "SOL/USDT"]

    for pair in pairs_to_test:
        print(f"\n[Testing {pair}]")

        # 1. Fetch ticker
        ticker = exchange.fetch_ticker(pair)
        print(f"  Last Price: {ticker.get('last')}")
        print(f"  Volume 24h (base): {ticker.get('baseVolume')}")

        # 2. Fetch OHLCV
        ohlcv = exchange.fetch_ohlcv(pair, timeframe="1h", limit=50)
        print(f"  Candles received: {len(ohlcv)}")

        if ohlcv:
            last_candle = ohlcv[-1]
            print(f"  Last candle: O={last_candle[1]}, H={last_candle[2]}, L={last_candle[3]}, C={last_candle[4]}, V={last_candle[5]}")

        # 3. Convert candles and run indicators
        candles = [
            {"timestamp": c[0], "open": c[1], "high": c[2], "low": c[3], "close": c[4], "volume": c[5]}
            for c in ohlcv
        ]

        features = calculate_technical_features(candles)
        print(f"  RSI (14):             {features['rsi_14']}")
        print(f"  BB Bandwidth (%):     {features['bb_bandwidth_percent']}")
        print(f"  ATR (%):              {features['atr_percent']}")
        print(f"  Volatility 24h (%):   {features['volatility_24h_percent']}")
        print(f"  Is Sideways:          {features['is_sideways']}")
        print(f"  Trend:                {features['trend']}")
        print(f"  Grid Suitability:     {features['grid_suitability_score']}%")

        # Verify NOT returning fallback defaults
        assert features['rsi_14'] != 50.0 or features['bb_bandwidth_percent'] != 3.5, \
            f"ERROR: {pair} is returning default fallback values! Candle count: {len(candles)}"

    print("\n" + "=" * 60)
    print("  ALL INDICATOR TESTS PASSED WITH LIVE BINANCE DATA")
    print("=" * 60)

if __name__ == "__main__":
    test_candles_and_indicators()
