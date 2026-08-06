"""Quick CoinGecko live connectivity and OHLC data test."""
import requests, time

TIMEOUT = 15
BASE = "https://api.coingecko.com/api/v3"

print("=== CoinGecko OHLC Test ===")
start = time.time()
try:
    r = requests.get(f"{BASE}/coins/bitcoin/ohlc",
                     params={"vs_currency": "usd", "days": "2"}, timeout=TIMEOUT)
    data = r.json()
    elapsed = time.time() - start
    print(f"Status: {r.status_code} | Time: {elapsed:.2f}s")
    print(f"Candle count: {len(data)}")
    if data:
        last = data[-1]
        print(f"Last candle: timestamp={last[0]}, O={last[1]}, H={last[2]}, L={last[3]}, C={last[4]}")
    else:
        print("WARNING: Empty candle list!")
except Exception as e:
    print(f"FAIL: {type(e).__name__}: {e}")

print()
print("=== CoinGecko Markets Batch Test ===")
start = time.time()
try:
    r2 = requests.get(f"{BASE}/coins/markets",
                      params={
                          "vs_currency": "usd",
                          "ids": "bitcoin,ethereum,solana",
                          "order": "market_cap_desc",
                          "per_page": 3,
                          "page": 1,
                      }, timeout=TIMEOUT)
    d2 = r2.json()
    elapsed = time.time() - start
    print(f"Status: {r2.status_code} | Time: {elapsed:.2f}s | Items: {len(d2)}")
    for coin in d2:
        sym = coin["symbol"].upper()
        price = coin["current_price"]
        vol = coin["total_volume"]
        chg = coin.get("price_change_percentage_24h", 0)
        print(f"  {sym}/USDT — Price: ${price:,.2f} | Vol 24h: ${vol:,.0f} | Change: {chg:.2f}%")
except Exception as e:
    print(f"FAIL: {type(e).__name__}: {e}")

print()
print("=== Indicators Test with Live CoinGecko Data ===")
import sys, os
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from indicators import calculate_technical_features

try:
    r3 = requests.get(f"{BASE}/coins/bitcoin/ohlc",
                      params={"vs_currency": "usd", "days": "2"}, timeout=TIMEOUT)
    raw = r3.json()
    candles = [
        {"timestamp": c[0], "open": float(c[1]), "high": float(c[2]),
         "low": float(c[3]), "close": float(c[4]), "volume": 0.0}
        for c in raw
    ]
    print(f"BTC candles received: {len(candles)}")
    if candles:
        features = calculate_technical_features(candles)
        print(f"RSI:           {features['rsi_14']}")
        print(f"BB Bandwidth:  {features['bb_bandwidth_percent']}%")
        print(f"ATR:           {features['atr_percent']}%")
        print(f"Volatility 24h:{features['volatility_24h_percent']}%")
        print(f"Trend:         {features['trend']}")
        print(f"Is Sideways:   {features['is_sideways']}")
        print(f"Grid Score:    {features['grid_suitability_score']}%")

        # Confirm NOT fallback
        if features["rsi_14"] == 50.0 and features["bb_bandwidth_percent"] == 3.5:
            print("WARNING: Still returning fallback defaults!")
        else:
            print("SUCCESS: Real computed indicator values confirmed!")
except Exception as e:
    print(f"FAIL: {type(e).__name__}: {e}")
