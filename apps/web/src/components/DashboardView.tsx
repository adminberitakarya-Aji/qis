'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Brain,
  ArrowUpRight,
  Layers,
  Sparkles,
  ChevronRight,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { getTopPairRecommendations, PairRecommendation } from '@/lib/api';

interface DashboardViewProps {
  onNavigateToStrategy: (pair?: string) => void;
}

// ---------------------------------------------------------------------------
// Static fallback data (used when Python AI Service / NestJS API is offline)
// ---------------------------------------------------------------------------
const FALLBACK_PAIRS: PairRecommendation[] = [
  {
    rank: 1,
    pair: 'BTC/USDT',
    confidenceScore: 92,
    reasoning:
      'BTC/USDT: Ideal range-bound (sideways) structure detected across last 24h (4.8% spread). Neutral RSI (51.2) indicates balanced buyer-seller equilibrium, minimizing breakout risk. Ultra-high market depth & liquidity ensures zero execution slippage.',
    volatility24hPercent: 4.8,
    volume24h: 2_400_000_000,
  },
  {
    rank: 2,
    pair: 'ETH/USDT',
    confidenceScore: 88,
    reasoning:
      'ETH/USDT: Tight Bollinger compression (3.9%) signals imminent systematic mean-reversion. Neutral RSI (49.7) indicates balanced buyer-seller equilibrium, minimizing breakout risk.',
    volatility24hPercent: 3.9,
    volume24h: 890_000_000,
  },
  {
    rank: 3,
    pair: 'SOL/USDT',
    confidenceScore: 85,
    reasoning:
      'SOL/USDT: High 24h price mobility (6.2% range) offers strong grid recycling frequency. Active momentum with RSI (63.1), wider section gaps recommended to absorb upper pullbacks.',
    volatility24hPercent: 6.2,
    volume24h: 320_000_000,
  },
  {
    rank: 4,
    pair: 'NEAR/USDT',
    confidenceScore: 82,
    reasoning:
      'NEAR/USDT: Ideal range-bound (sideways) structure detected across last 24h (3.6% spread). Tight Bollinger compression (2.8%) signals imminent systematic mean-reversion.',
    volatility24hPercent: 3.6,
    volume24h: 72_000_000,
  },
  {
    rank: 5,
    pair: 'AVAX/USDT',
    confidenceScore: 80,
    reasoning:
      'AVAX/USDT: Oversold RSI (38.4) suggests strong potential support near lower section grid levels. High 24h price mobility (5.1% range) offers strong grid recycling frequency.',
    volatility24hPercent: 5.1,
    volume24h: 156_000_000,
  },
];

const DASHBOARD_METRICS = [
  {
    title: 'Total Portfolio Capital',
    value: '$45,280.50',
    subtitle: 'Across Binance & Bybit Spot',
    change: '+12.4%',
    isPositive: true,
  },
  {
    title: 'Active Grid Strategies',
    value: '3 Strategies',
    subtitle: 'BTC/USDT, ETH/USDT, SOL/USDT',
    change: 'RUNNING',
    isPositive: true,
  },
  {
    title: '24h Realized Profit',
    value: '+$428.10',
    subtitle: '42 Grid Rounds Completed',
    change: '+3.2%',
    isPositive: true,
  },
  {
    title: 'Strategy Win Rate',
    value: '94.2%',
    subtitle: '156 Total Rounds Completed',
    change: '147 Win / 9 Loss',
    isPositive: true,
  },
];

// ---------------------------------------------------------------------------
// Helper: format large volume numbers
// ---------------------------------------------------------------------------
function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `$${(vol / 1_000_000_000).toFixed(1)}B`;
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(0)}M`;
  return `$${vol.toLocaleString()}`;
}

// ---------------------------------------------------------------------------
// Score → color class
// ---------------------------------------------------------------------------
function scoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-profit';
  if (score >= 80) return 'text-electric-blue';
  if (score >= 70) return 'text-amber-400';
  return 'text-zinc-400';
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigateToStrategy }) => {
  const [pairs, setPairs] = useState<PairRecommendation[]>(FALLBACK_PAIRS);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchPairs = useCallback(async () => {
    setIsLoading(true);
    const result = await getTopPairRecommendations('binance');
    if (result && result.length > 0) {
      setPairs(result);
      setIsLive(true);
    } else {
      setPairs(FALLBACK_PAIRS);
      setIsLive(false);
    }
    setLastUpdated(new Date());
    setIsLoading(false);
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchPairs();
  }, [fetchPairs]);

  // Auto-refresh every 15 minutes
  useEffect(() => {
    const interval = setInterval(fetchPairs, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchPairs]);

  return (
    <div className="p-8 space-y-8 bg-pitch-bg text-zinc-100 max-w-[1600px] mx-auto">
      {/* Hero Welcome Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-pitch-card via-pitch-surface to-pitch-card border border-pitch-border flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-electric-blue/5 rounded-full filter blur-3xl pointer-events-none"></div>
        <div className="space-y-2 relative z-10">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-neon-purple/20 border border-neon-purple/30 text-neon-purple text-xs font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> AI Strategy Planner
            </span>
            {isLive ? (
              <span className="text-xs text-emerald-profit flex items-center gap-1 font-semibold">
                <Wifi className="w-3 h-3" /> Live AI Data
              </span>
            ) : (
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                <WifiOff className="w-3 h-3" /> Demo Mode
              </span>
            )}
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            AI-Assisted Grid Trading Control Center
          </h2>
          <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
            AI analyzes RSI, Bollinger Band Width, ATR & Volume to recommend optimal Strategy Blueprints. Execution remains 100% deterministic and under your explicit control.
          </p>
        </div>

        <button
          onClick={() => onNavigateToStrategy('BTC/USDT')}
          className="px-5 py-3 rounded-xl bg-electric-blue hover:bg-electric-blue/90 text-white font-bold text-sm shadow-lg glow-blue transition-all flex items-center gap-2 shrink-0"
        >
          <Brain className="w-4 h-4 text-white" />
          <span>Build AI Strategy</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Top 4 Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {DASHBOARD_METRICS.map((m, idx) => (
          <div
            key={idx}
            className="p-5 rounded-2xl bg-pitch-card border border-pitch-border hover:border-pitch-borderLight transition-all group"
          >
            <div className="flex items-center justify-between text-xs font-medium text-zinc-400 mb-3">
              <span>{m.title}</span>
              <span className="px-2 py-0.5 rounded bg-emerald-profit/15 text-emerald-profit font-semibold">
                {m.change}
              </span>
            </div>
            <div className="text-2xl font-black text-white font-mono tracking-tight mb-1 group-hover:text-electric-blue transition-colors">
              {m.value}
            </div>
            <div className="text-[11px] text-zinc-500 font-medium">{m.subtitle}</div>
          </div>
        ))}
      </div>

      {/* Main Grid: AI Recommendations + Live Grid Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: AI Top 5 Pair Recommendations */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-neon-purple/15 text-neon-purple">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-white">Top 5 AI Pair Recommendations</h3>
                <p className="text-xs text-zinc-400">
                  {lastUpdated
                    ? `Updated ${lastUpdated.toLocaleTimeString()} — RSI(14) · BB Width(20,2) · ATR(14) · Volume Score`
                    : 'Loading from Python AI Service...'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isLoading && (
                <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
              )}
              <button
                onClick={fetchPairs}
                disabled={isLoading}
                title="Refresh AI Recommendations"
                className="p-1.5 rounded-lg bg-pitch-surface border border-pitch-border text-zinc-400 hover:text-white hover:border-electric-blue transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => onNavigateToStrategy()}
                className="text-xs text-electric-blue hover:text-electric-light font-semibold flex items-center gap-1"
              >
                Build Strategy <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {pairs.map((item) => (
              <div
                key={item.rank}
                className="p-5 rounded-2xl bg-pitch-card border border-pitch-border hover:border-pitch-borderLight transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group"
              >
                {/* Pair Details */}
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-xl bg-pitch-surface border border-pitch-border flex items-center justify-center font-bold text-xs text-zinc-400 shrink-0">
                    #{item.rank}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-black text-white font-mono">{item.pair}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-pitch-surface border border-pitch-border text-zinc-400 font-mono">
                        Vol: {formatVolume(item.volume24h)}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-400 font-mono">
                        ±{item.volatility24hPercent.toFixed(1)}% / 24h
                      </span>
                    </div>
                    {/* Explainable AI Reasoning */}
                    <p className="text-[11px] text-zinc-400 leading-relaxed italic max-w-xl">
                      "{item.reasoning}"
                    </p>
                    {/* Indicator Tags derived from reasoning */}
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {item.volatility24hPercent >= 3 && item.volatility24hPercent <= 8 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-profit/10 text-emerald-profit border border-emerald-profit/20">
                          Grid-Optimal Volatility
                        </span>
                      )}
                      {item.volatility24hPercent > 8 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20">
                          High Volatility — Wider Grids
                        </span>
                      )}
                      {item.volume24h > 500_000_000 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-electric-blue/10 text-electric-blue border border-electric-blue/20">
                          Ultra-High Liquidity
                        </span>
                      )}
                      {item.confidenceScore >= 90 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-neon-purple/10 text-neon-purple border border-neon-purple/20">
                          Top Confidence
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Score & Action */}
                <div className="flex items-center gap-4 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-pitch-border">
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-bold text-zinc-500">AI Score</div>
                    <div className={`text-lg font-black font-mono ${scoreColor(item.confidenceScore)}`}>
                      {item.confidenceScore.toFixed(0)}%
                    </div>
                  </div>

                  <button
                    onClick={() => onNavigateToStrategy(item.pair)}
                    className="px-4 py-2.5 rounded-xl bg-pitch-surface hover:bg-electric-blue hover:text-white text-zinc-200 border border-pitch-border font-bold text-xs transition-all flex items-center gap-1.5 group-hover:border-electric-blue/50"
                  >
                    <span>Build Strategy</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right 1 Col: Live Grid Monitor */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-profit/15 text-emerald-profit">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-white">Live Grid Monitor</h3>
                <p className="text-xs text-zinc-400">BTC/USDT 3-Section Grid</p>
              </div>
            </div>
          </div>

          {/* Chart Preview Container */}
          <div className="p-5 rounded-2xl bg-pitch-card border border-pitch-border space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-zinc-300">Live Price via Binance WS</span>
              <span className="text-emerald-profit font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> 18 Grid Levels Active
              </span>
            </div>

            {/* Grid Visualizer */}
            <div className="h-64 rounded-xl bg-pitch-bg border border-pitch-border p-4 relative flex flex-col justify-between overflow-hidden">
              <div className="text-[10px] font-mono text-zinc-600">Section 1 (Upper TP Lines)</div>

              <div className="space-y-2 z-10">
                <div className="w-full h-px bg-neon-purple/50 border-t border-dashed border-neon-purple flex items-center justify-end">
                  <span className="text-[9px] font-mono text-neon-purple bg-pitch-bg px-1">
                    TP #3: $98,200
                  </span>
                </div>
                <div className="w-full h-px bg-neon-purple/50 border-t border-dashed border-neon-purple flex items-center justify-end">
                  <span className="text-[9px] font-mono text-neon-purple bg-pitch-bg px-1">
                    TP #2: $97,500
                  </span>
                </div>
                <div className="w-full h-px bg-electric-blue border-t border-electric-blue flex items-center justify-end">
                  <span className="text-[9px] font-mono text-electric-blue bg-pitch-bg px-1 animate-pulse">
                    LIVE PRICE ◉
                  </span>
                </div>
                <div className="w-full h-px bg-emerald-profit/50 border-t border-dashed border-emerald-profit flex items-center justify-end">
                  <span className="text-[9px] font-mono text-emerald-profit bg-pitch-bg px-1">
                    BUY #1: $95,200
                  </span>
                </div>
                <div className="w-full h-px bg-emerald-profit/50 border-t border-dashed border-emerald-profit flex items-center justify-end">
                  <span className="text-[9px] font-mono text-emerald-profit bg-pitch-bg px-1">
                    BUY #2: $94,100
                  </span>
                </div>
              </div>

              <div className="text-[10px] font-mono text-zinc-600">
                Section Gap 2.0% → Section 2
              </div>
            </div>

            {/* Strategy Stats Box */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-pitch-surface border border-pitch-border">
                <div className="text-zinc-500 font-medium">Realized PnL</div>
                <div className="text-sm font-bold text-emerald-profit font-mono">+$248.50</div>
              </div>
              <div className="p-3 rounded-xl bg-pitch-surface border border-pitch-border">
                <div className="text-zinc-500 font-medium">Unrealized PnL</div>
                <div className="text-sm font-bold text-zinc-300 font-mono">+$14.20</div>
              </div>
            </div>

            {/* Binance WS Status */}
            <div className="flex items-center gap-2 text-[10px] text-zinc-500 pt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-profit animate-pulse"></div>
              Binance WebSocket Worker monitoring live grid levels
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
