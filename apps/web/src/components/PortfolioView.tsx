'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { PieChart, RefreshCw, WifiOff } from 'lucide-react';
import type { PortfolioSummary, ActiveStrategy } from '@/lib/api';
import { getPortfolioSummary, getActiveStrategies } from '@/lib/api';

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/** Build asset breakdown rows from the list of active strategies. */
function buildAssetRows(strategies: ActiveStrategy[], summary: PortfolioSummary) {
  // Group capital by pair
  const capitalByPair: Record<string, number> = {};
  for (const s of strategies) {
    capitalByPair[s.pair] = (capitalByPair[s.pair] ?? 0) + s.capital;
  }

  // Total capital in strategies + available USDT is summary.totalCapitalUsdt (all committed)
  const totalCapital = summary.totalCapitalUsdt > 0 ? summary.totalCapitalUsdt : 1;

  return Object.entries(capitalByPair).map(([pair, capital]) => {
    const baseAsset = pair.split('/')[0]; // e.g. "BTC" from "BTC/USDT"
    const allocationPct = ((capital / totalCapital) * 100).toFixed(1);
    return {
      asset: baseAsset,
      pair,
      balance: `$${capital.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      allocation: `${allocationPct}%`,
      value: `$${capital.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    };
  });
}

/** Per-strategy capital & PnL rows for the right panel */
function buildStrategyRows(strategies: ActiveStrategy[], summary: PortfolioSummary) {
  if (strategies.length === 0) return [];

  const pnlPerStrategy = summary.realizedPnl24hUsdt / strategies.length;

  return strategies.map((s) => ({
    id: s.id,
    label: `${s.pair} Strategy`,
    capital: s.capital,
    pnl: pnlPerStrategy,
    status: s.status,
  }));
}

export const PortfolioView: React.FC = () => {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [strategies, setStrategies] = useState<ActiveStrategy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  const fetchData = useCallback(async () => {
    const [summaryData, strategiesData] = await Promise.all([
      getPortfolioSummary(),
      getActiveStrategies(),
    ]);

    if (summaryData) {
      setSummary(summaryData);
      setIsLive(true);
    }
    if (strategiesData) {
      setStrategies(strategiesData);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => void fetchData(), 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ------------------------------------------------------------------
  // Loading skeleton
  // ------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="p-8 space-y-8 bg-pitch-bg text-zinc-100 max-w-[1600px] mx-auto animate-pulse">
        <div className="h-10 w-64 rounded-xl bg-pitch-card" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 p-6 rounded-2xl bg-pitch-card border border-pitch-border h-64" />
          <div className="p-6 rounded-2xl bg-pitch-card border border-pitch-border h-64" />
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Offline / empty state
  // ------------------------------------------------------------------
  if (!summary) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <div className="p-5 rounded-2xl bg-pitch-card border border-pitch-border">
          <WifiOff className="w-10 h-10 text-zinc-600 mx-auto" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white mb-1">Portfolio Data Unavailable</h3>
          <p className="text-sm text-zinc-500 max-w-sm">
            Unable to reach the backend API. Please check that the API server is running.
          </p>
        </div>
        <button
          onClick={() => void fetchData()}
          className="px-4 py-2 rounded-xl bg-electric-blue/10 hover:bg-electric-blue hover:text-white text-electric-blue border border-electric-blue/30 font-bold text-xs transition-all flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  const assetRows = buildAssetRows(strategies, summary);
  const strategyRows = buildStrategyRows(strategies, summary);

  return (
    <div className="p-8 space-y-8 bg-pitch-bg text-zinc-100 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-electric-blue/15 text-electric-blue border border-electric-blue/30 glow-blue">
            <PieChart className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white tracking-tight">Portfolio & Asset Allocation</h2>
            <p className="text-xs text-zinc-400">Total balance breakdown across exchanges and active strategies</p>
          </div>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2">
          {isLive && <div className="w-1.5 h-1.5 rounded-full bg-emerald-profit animate-pulse" />}
          <span className={`text-xs font-semibold ${isLive ? 'text-emerald-profit' : 'text-zinc-500'}`}>
            {isLive ? 'Live Data' : 'Offline'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Asset Allocation Breakdown */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-pitch-card border border-pitch-border space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-white">Asset Balance Breakdown</h3>
            <span className="text-xs text-zinc-500 font-mono">
              Total: ${summary.totalCapitalUsdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
            </span>
          </div>

          {assetRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-600 gap-2">
              <PieChart className="w-8 h-8" />
              <p className="text-sm">No active strategies — no asset breakdown available.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-pitch-border text-zinc-500 uppercase tracking-wider font-mono">
                    <th className="py-3 px-4">Asset</th>
                    <th className="py-3 px-4">Committed Capital</th>
                    <th className="py-3 px-4">Allocation %</th>
                    <th className="py-3 px-4 text-right">Est. USDT Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pitch-border font-mono">
                  {assetRows.map((item, idx) => (
                    <tr key={idx} className="hover:bg-pitch-surface/60 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-electric-blue" />
                        {item.asset}
                        <span className="text-zinc-600 font-normal">{item.pair}</span>
                      </td>
                      <td className="py-3.5 px-4 text-zinc-300">{item.balance}</td>
                      <td className="py-3.5 px-4 text-neon-purple font-bold">{item.allocation}</td>
                      <td className="py-3.5 px-4 text-right font-bold text-white">{item.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary row */}
          <div className="flex items-center justify-between pt-2 border-t border-pitch-border">
            <span className="text-xs text-zinc-500 font-mono">
              {summary.activeStrategies} Active {summary.activeStrategies === 1 ? 'Strategy' : 'Strategies'} •{' '}
              {summary.totalRoundsCompleted} Rounds Completed
            </span>
            <span className={`text-xs font-bold font-mono ${summary.realizedPnl24hUsdt >= 0 ? 'text-emerald-profit' : 'text-red-400'}`}>
              {summary.realizedPnl24hUsdt >= 0 ? '+' : ''}${summary.realizedPnl24hUsdt.toFixed(2)} 24h PnL
            </span>
          </div>
        </div>

        {/* Right Column: Capital Allocation per Strategy */}
        <div className="p-6 rounded-2xl bg-pitch-card border border-pitch-border space-y-4">
          <h3 className="text-base font-extrabold text-white">Strategy Capital Usage</h3>

          {strategyRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-zinc-600 gap-2">
              <p className="text-sm text-center">No active strategies running.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {strategyRows.map((s) => (
                <div key={s.id} className="p-4 rounded-xl bg-pitch-surface border border-pitch-border space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-white font-mono">{s.label}</span>
                    <span className={`font-bold font-mono ${s.pnl >= 0 ? 'text-emerald-profit' : 'text-red-400'}`}>
                      {s.pnl >= 0 ? '+' : ''}${s.pnl.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400 font-mono">
                    Capital: ${s.capital.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (
                    <span className={s.status === 'active' ? 'text-emerald-profit' : 'text-zinc-500'}>
                      {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                    </span>
                    )
                  </div>
                  {/* Capital bar */}
                  <div className="w-full h-1.5 bg-pitch-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-electric-blue rounded-full transition-all"
                      style={{ width: `${Math.min((s.capital / summary.totalCapitalUsdt) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Portfolio win rate summary */}
          <div className="pt-2 border-t border-pitch-border">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-zinc-500">Win Rate</span>
              <span className="text-electric-blue font-bold">{summary.winRate.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
