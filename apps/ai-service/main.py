from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict
import requests
import time
import json
import logging
import sys
from datetime import datetime
import pandas as pd
from indicators import calculate_technical_features
from reasoning import generate_pair_reasoning, generate_strategy_recommendation


# ─────────────────────────────────────────────────────────────────────────────
# Structured Logging Setup
# Produces JSON log entries in production for monitoring/aggregation.
# ─────────────────────────────────────────────────────────────────────────────
class StructuredFormatter(logging.Formatter):
    """JSON formatter for structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname.lower(),
            "service": "qis-ai-service",
            "message": record.getMessage(),
        }
        # Include extra context if provided
        if hasattr(record, "context") and record.context:
            log_entry["context"] = record.context
        if record.exc_info and record.exc_info[0]:
            log_entry["error"] = {
                "type": record.exc_info[0].__name__,
                "message": str(record.exc_info[1]),
            }
        return json.dumps(log_entry)


logger = logging.getLogger("qis-ai-service")
logger.setLevel(logging.INFO)

# Console handler with structured output
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(StructuredFormatter())
logger.addHandler(console_handler)


def log_info(message: str, **context):
    """Structured info log with context."""
    logger.info(message, extra={"context": context})


def log_error(message: str, exc_info=None, **context):
    """Structured error log with context."""
    logger.error(message, extra={"context": context}, exc_info=exc_info)


def log_warn(message: str, **context):
    """Structured warning log with context."""
    logger.warning(message, extra={"context": context})


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
# NOTE: candle/OHLCV data now comes from Binance klines (_fetch_klines_binance),
# not CoinGecko — see CHANGELOG-driven migration. CoinGecko is only used for
# _fetch_markets_batch's 24h volume/price-change metadata (a single batched
# call per /analyze/top-pairs request, well within its free-tier rate limit).

# ─────────────────────────────────────────────────────────────────────────────
# Binance exchangeInfo — used only to read the NOTIONAL/MIN_NOTIONAL filter per
# symbol so the AI Strategy Planner can size grids that are actually
# executable. This is a public, unauthenticated endpoint (no API key needed).
# Cached in-process since these filter values change rarely (see Binance
# CHANGELOG — filter updates are announced weeks in advance).
# ─────────────────────────────────────────────────────────────────────────────
BINANCE_BASE = "https://data-api.binance.vision"  # market-data-only mirror; api.binance.com's :443 is blocked from some VPS/hosting networks — this endpoint isn't
DEFAULT_MIN_NOTIONAL = 10.0  # conservative fallback if Binance is unreachable
_min_notional_cache: Dict[str, tuple] = {}  # symbol -> (value, fetched_at_epoch)
MIN_NOTIONAL_CACHE_TTL_SECS = 6 * 60 * 60  # 6 hours — filters rarely change


def _to_binance_symbol(pair: str) -> str:
    """'BTC/USDT' -> 'BTCUSDT'"""
    return pair.replace("/", "").upper()


def get_min_notional(pair: str) -> float:
    """
    Returns the minimum order notional (price * quantity, in USDT) Binance
    will accept for this symbol. Checks both the modern `NOTIONAL` filter
    and the legacy `MIN_NOTIONAL` filter (older symbols may still expose the
    legacy one). Falls back to DEFAULT_MIN_NOTIONAL if the symbol or filter
    can't be resolved, so a transient Binance/network issue degrades to a
    safe conservative default rather than letting grids size below the real
    minimum.
    """
    symbol = _to_binance_symbol(pair)

    cached = _min_notional_cache.get(symbol)
    if cached and (time.time() - cached[1]) < MIN_NOTIONAL_CACHE_TTL_SECS:
        return cached[0]

    try:
        resp = requests.get(
            f"{BINANCE_BASE}/api/v3/exchangeInfo",
            params={"symbol": symbol},
            timeout=TIMEOUT_SECS,
        )
        resp.raise_for_status()
        data = resp.json()
        symbols = data.get("symbols", [])
        if not symbols:
            log_warn("Symbol not found on Binance exchangeInfo", symbol=symbol)
            return DEFAULT_MIN_NOTIONAL

        filters = symbols[0].get("filters", [])
        min_notional = None
        for f in filters:
            if f.get("filterType") == "NOTIONAL":
                min_notional = float(f.get("minNotional", DEFAULT_MIN_NOTIONAL))
                break
            if f.get("filterType") == "MIN_NOTIONAL":
                min_notional = float(f.get("minNotional", DEFAULT_MIN_NOTIONAL))
                break

        if min_notional is None:
            log_warn("No NOTIONAL/MIN_NOTIONAL filter found", symbol=symbol)
            min_notional = DEFAULT_MIN_NOTIONAL

        _min_notional_cache[symbol] = (min_notional, time.time())
        return min_notional

    except Exception as e:
        log_warn(f"Failed to fetch min notional for {symbol}", error=str(e))
        return DEFAULT_MIN_NOTIONAL


def _cg_get(path: str, params: dict = {}) -> dict | list:
    """Thin wrapper around CoinGecko REST calls with error handling."""
    url = f"{COINGECKO_BASE}{path}"
    resp = requests.get(url, params=params, timeout=TIMEOUT_SECS)
    resp.raise_for_status()
    return resp.json()


def _fetch_klines_binance(pair: str, interval: str = "1h", limit: int = 48) -> List[dict]:
    """
    Fetches OHLCV candles from Binance's public /api/v3/klines endpoint.
    Weight 2 per call, no API key required, 6000/min budget per IP — far more
    headroom than CoinGecko's free tier, and no separate volume call needed
    (unlike CoinGecko's OHLC endpoint, klines includes volume natively).
    Returns candle dicts compatible with indicators.py's expected shape.
    """
    symbol = _to_binance_symbol(pair)
    resp = requests.get(
        f"{BINANCE_BASE}/api/v3/klines",
        params={"symbol": symbol, "interval": interval, "limit": limit},
        timeout=TIMEOUT_SECS,
    )
    resp.raise_for_status()
    raw = resp.json()

    # Each row: [openTime, open, high, low, close, volume, closeTime, ...]
    return [
        {
            "timestamp": row[0],
            "open": float(row[1]),
            "high": float(row[2]),
            "low": float(row[3]),
            "close": float(row[4]),
            "volume": float(row[5]),
        }
        for row in raw
    ]


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
    log_info("Analyzing top pairs", candidate_count=req.candidateCount)

    pool = CANDIDATE_PAIRS[: req.candidateCount]
    cg_ids = [p["cg_id"] for p in pool]

    # ── Batch fetch 24h market data (1 API call for all) ──────────────────
    try:
        markets = _fetch_markets_batch(cg_ids)
    except Exception as e:
        log_warn("Failed to fetch markets batch", error=str(e))
        markets = {}

    results = []

    for item in pool:
        pair     = item["pair"]
        cg_id    = item["cg_id"]
        mkt      = markets.get(cg_id, {})
        volume24 = float(mkt.get("total_volume", 100_000_000))

        # ── Fetch OHLCV candles (Binance klines — no rate-limit trouble) ───
        try:
            candles = _fetch_klines_binance(pair)
        except Exception as e:
            log_warn(f"Failed to fetch klines for {pair}", error=str(e))
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
    log_info("Analyzing strategy", symbol=req.symbol, section_count=req.sectionCount)

    # Normalize symbol: "BTC/USDT" → validate against supported candidate pool
    normalized = req.symbol.replace("/", "").upper()
    is_supported = any(
        item["pair"].replace("/", "").upper() == normalized or item["pair"] == req.symbol
        for item in CANDIDATE_PAIRS
    )

    if not is_supported:
        log_warn("Symbol not in supported candidate pool", symbol=req.symbol)
        raise HTTPException(
            status_code=400,
            detail=f"Symbol '{req.symbol}' not in supported candidate pool. Use format 'BTC/USDT'.",
        )

    try:
        candles = _fetch_klines_binance(req.symbol)
    except Exception as e:
        log_warn(f"Failed to fetch klines for {req.symbol}", error=str(e))
        candles = []

    features = calculate_technical_features(candles)
    min_notional = get_min_notional(req.symbol)

    return generate_strategy_recommendation(
        symbol=req.symbol,
        features=features,
        section_count=req.sectionCount,
        capital=req.capital,
        min_notional=min_notional,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)