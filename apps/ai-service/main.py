from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict
import requests
import time
import pandas as pd
from indicators import calculate_technical_features
from reasoning import generate_pair_reasoning, generate_strategy_recommendation

app = FastAPI(
    title="Qis AI Service",
    description="Python FastAPI Technical Indicator Feature Extraction & AI Pattern Recognition Engine",
    version="1.0.0",
)

# ─────────────────────────────────────────────────────────────────────────────
# Candidate Pool: Top 20 USDT pairs mapped to CoinGecko IDs
# CoinGecko is the primary data source (no geo-restriction, free public API)
# ─────────────────────────────────────────────────────────────────────────────
CANDIDATE_PAIRS: List[Dict[str, str]] = [
    {"pair": "BTC/USDT",  "cg_id": "bitcoin"},
    {"pair": "ETH/USDT",  "cg_id": "ethereum"},
    {"pair": "SOL/USDT",  "cg_id": "solana"},
    {"pair": "BNB/USDT",  "cg_id": "binancecoin"},
    {"pair": "XRP/USDT",  "cg_id": "ripple"},
    {"pair": "ADA/USDT",  "cg_id": "cardano"},
    {"pair": "AVAX/USDT", "cg_id": "avalanche-2"},
    {"pair": "NEAR/USDT", "cg_id": "near"},
    {"pair": "LINK/USDT", "cg_id": "chainlink"},
    {"pair": "DOGE/USDT", "cg_id": "dogecoin"},
    {"pair": "DOT/USDT",  "cg_id": "polkadot"},
    {"pair": "MATIC/USDT","cg_id": "matic-network"},
    {"pair": "SUI/USDT",  "cg_id": "sui"},
    {"pair": "APT/USDT",  "cg_id": "aptos"},
    {"pair": "INJ/USDT",  "cg_id": "injective-protocol"},
    {"pair": "LTC/USDT",  "cg_id": "litecoin"},
    {"pair": "BCH/USDT",  "cg_id": "bitcoin-cash"},
    {"pair": "FET/USDT",  "cg_id": "fetch-ai"},
    {"pair": "SHIB/USDT", "cg_id": "shiba-inu"},
    {"pair": "PEPE/USDT", "cg_id": "pepe"},
]

COINGECKO_BASE = "https://api.coingecko.com/api/v3"
TIMEOUT_SECS   = 15
# Polite delay between OHLC requests to respect CoinGecko free-tier rate limit
CG_REQUEST_DELAY = 1.2  # seconds


def _cg_get(path: str, params: dict = {}) -> dict | list:
    """Thin wrapper around CoinGecko REST calls with error handling."""
    url = f"{COINGECKO_BASE}{path}"
    resp = requests.get(url, params=params, timeout=TIMEOUT_SECS)
    resp.raise_for_status()
    return resp.json()


def _fetch_markets_batch(cg_ids: List[str]) -> Dict[str, dict]:
    """
    Batch-fetches 24h market data for multiple coins in a single API call.
    Returns a dict keyed by cg_id.
    """
    ids_str = ",".join(cg_ids)
    data = _cg_get("/coins/markets", params={
        "vs_currency": "usd",
        "ids": ids_str,
        "order": "market_cap_desc",
        "per_page": len(cg_ids),
        "page": 1,
        "price_change_percentage": "24h",
    })
    return {item["id"]: item for item in data}


def _fetch_ohlc(cg_id: str) -> List[dict]:
    """
    Fetches hourly OHLC candles via CoinGecko OHLC endpoint.
    days=2 → ~48 hourly candles (last 2 days).
    Returns list of candle dicts compatible with indicators.py.
    """
    # CoinGecko OHLC: [[timestamp_ms, open, high, low, close], ...]
    raw = _cg_get(f"/coins/{cg_id}/ohlc", params={"vs_currency": "usd", "days": "2"})
    if not raw:
        return []
    return [
        {
            "timestamp": row[0],
            "open":  float(row[1]),
            "high":  float(row[2]),
            "low":   float(row[3]),
            "close": float(row[4]),
            "volume": 0.0,  # OHLC endpoint doesn't include volume; indicators don't use it
        }
        for row in raw
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────────────────────────
class TopPairsRequest(BaseModel):
    exchange: str = "binance"   # kept for API compatibility; data comes from CoinGecko
    candidateCount: int = 15


class PairRecommendationResponse(BaseModel):
    rank: int
    pair: str
    confidenceScore: float
    reasoning: str
    volatility24hPercent: float
    volume24h: float


class StrategyAnalysisRequest(BaseModel):
    exchange: str = "binance"
    symbol: str
    sectionCount: int = 3
    capital: float = 1000.0


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "Qis AI Service", "version": "1.0.0"}


@app.post("/analyze/top-pairs", response_model=List[PairRecommendationResponse])
def get_top_pairs(req: TopPairsRequest):
    """
    Step 1: Screen top N from candidate pool via CoinGecko (batch market request)
    Step 2: Fetch hourly OHLC for each candidate
    Step 3: Feature Extraction (RSI, BB Width, ATR, Volatility, Sideways score)
    Step 4: Pattern Recognition + Confidence Score + Explainable Reasoning
    Step 5: Return Top 5 sorted by Confidence Score
    """
    pool = CANDIDATE_PAIRS[: req.candidateCount]
    cg_ids = [p["cg_id"] for p in pool]

    # ── Batch fetch 24h market data (1 API call for all) ──────────────────
    try:
        markets = _fetch_markets_batch(cg_ids)
    except Exception:
        markets = {}

    results = []

    for item in pool:
        pair     = item["pair"]
        cg_id    = item["cg_id"]
        mkt      = markets.get(cg_id, {})
        volume24 = float(mkt.get("total_volume", 100_000_000))

        # ── Fetch OHLC candles ────────────────────────────────────────────
        try:
            candles = _fetch_ohlc(cg_id)
            time.sleep(CG_REQUEST_DELAY)   # respect free-tier rate limit
        except Exception:
            candles = []

        # ── Feature Extraction ────────────────────────────────────────────
        features = calculate_technical_features(candles)

        # ── Pattern Recognition & Reasoning ───────────────────────────────
        rec = generate_pair_reasoning(pair, features, volume24)
        results.append(rec)

    # Sort descending by Confidence Score, return Top 5
    results.sort(key=lambda x: x["confidenceScore"], reverse=True)

    return [
        PairRecommendationResponse(
            rank=idx,
            pair=r["pair"],
            confidenceScore=r["confidenceScore"],
            reasoning=r["reasoning"],
            volatility24hPercent=r["volatility24hPercent"],
            volume24h=r["volume24h"],
        )
        for idx, r in enumerate(results[:5], start=1)
    ]


@app.post("/analyze/strategy")
def analyze_strategy(req: StrategyAnalysisRequest):
    """
    Analyzes a specific pair and returns AI-optimized strategy parameters:
    - Grid Count per section
    - Grid Distance %
    - Section Gap %
    - Min Net Profit % per section
    Based on real ATR, RSI, BB Width from last 48h hourly OHLC.
    """
    # Normalize symbol: "BTC/USDT" → lookup in candidate pool
    normalized = req.symbol.replace("/", "").upper()
    cg_id = None
    for item in CANDIDATE_PAIRS:
        if item["pair"].replace("/", "").upper() == normalized or item["pair"] == req.symbol:
            cg_id = item["cg_id"]
            break

    if not cg_id:
        raise HTTPException(
            status_code=400,
            detail=f"Symbol '{req.symbol}' not in supported candidate pool. Use format 'BTC/USDT'.",
        )

    try:
        candles = _fetch_ohlc(cg_id)
    except Exception:
        candles = []

    features = calculate_technical_features(candles)

    return generate_strategy_recommendation(
        symbol=req.symbol,
        features=features,
        section_count=req.sectionCount,
        capital=req.capital,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
