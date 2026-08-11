'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { BarChart3, Award, RefreshCw, Download, WifiOff } from 'lucide-react';
import type { AnalyticsSummary, TradingMode } from '@/lib/api';
import { getAnalyticsSummary } from '@/lib/api';

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function formatMonth(monthKey: string): string {
  // monthKey = "2026-08"
  const [year, month] = monthKey.split('-');
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${year} - ${monthNames[parseInt(month, 10) - 1] ?? month}`;
}

function pnlColor(val: number) {
  return val >= 0 ? 'text-emerald-400' : 'text-red-400';
}

interface AnalyticsViewProps {
  tradingMode: TradingMode;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ tradingMode }) => {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const data = await getAnalyticsSummary(tradingMode);
    if (data) {
      setAnalytics(data);
      setIsLive(true);
    } else {
      setAnalytics(null);
      setIsLive(false);
    }
    setIsLoading(false);
  }, [tradingMode]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => void fetchData(), 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ------------------------------------------------------------------
  // Export CSV
  // ------------------------------------------------------------------
  const handleExportCsv = () => {
    if (!analytics) return;
    const rows = [
      ['Month', 'Completed Rounds', 'Realized PnL (USDT)', 'Fees Paid (USDT)', 'Net PnL (USDT)'],
      ...analytics.monthlyBreakdown.map((m) => [
        formatMonth(m.month),
        m.rounds.toString(),
        m.realizedPnlUsdt.toFixed(2),
        m.feesUsdt.toFixed(2),
        m.netPnlUsdt.toFixed(2),
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qis-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ------------------------------------------------------------------
  // Loading skeleton
  // ------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="p-8 space-y-8 bg-pitch-bg text-zinc-100 max-w-[1600px] mx-auto animate-pulse">
        <div className="flex justify-between">
          <div className="h-10 w-72 rounded-xl bg-pitch-card" />
          <div className="h-9 w-36 rounded-xl bg-pitch-card" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-5 rounded-2xl bg-pitch-card border border-pitch-border h-24" />
          ))}
        </div>
        <div className="p-6 rounded-2xl bg-pitch-card border border-pitch-border h-48" />
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Offline / empty state
  // ------------------------------------------------------------------
  if (!analytics) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <div className="p-5 rounded-2xl bg-pitch-card border border-pitch-border">
          <WifiOff className="w-10 h-10 text-zinc-600 mx-auto" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white mb-1">Analytics Data Unavailable</h3>
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

  // Derived: win rounds count
  const winRounds = Math.round((analytics.winRate / 100) * analytics.totalRounds);

  const stats = [
    {
      title: 'Total Realized PnL',
      value: `${analytics.totalRealizedPnlUsdt >= 0 ? '+' : ''}$${analytics.totalRealizedPnlUsdt.toFixed(2)}`,
      sub: `${analytics.totalRealizedPnlUsdt >= 0 ? '+' : ''}${analytics.netPnlUsdt.toFixed(2)} Net after fees`,
      color: analytics.totalRealizedPnlUsdt >= 0 ? 'text-emerald-400' : 'text-red-400',
    },
    {
      title: 'Total Fees Paid',
      value: `$${analytics.totalFeesUsdt.toFixed(2)}`,
      sub: `Est. Spot exchange fees`,
      color: 'text-zinc-300',
    },
    {
      title: 'Win Rate',
      value: `${analytics.winRate.toFixed(1)}%`,
      sub: `${winRounds} / ${analytics.totalRounds} rounds profitable`,
      color: 'text-electric-blue',
    },
    {
      title: 'Best Pair',
      value: analytics.bestPairByPnl ?? '—',
      sub: analytics.bestPairByPnl
        ? `Highest PnL pair across ${analytics.totalRounds} rounds`
        : 'No completed rounds yet',
      color: 'text-neon-purple',
    },
  ];

  // Sorted monthly breakdown — most recent first
  const sortedMonthly = [...analytics.monthlyBreakdown].sort((a, b) =>
    b.month.localeCompare(a.month)
  );

  return (
    <div className="p-8 space-y-8 bg-pitch-bg text-zinc-100 max-w-[1600px] mx-auto">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-electric-blue/20 border border-electric-blue/30 text-electric-blue glow-blue">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white tracking-tight">Performance Analytics & Reports</h2>
            <p className="text-xs text-zinc-400">
              Detailed break-down of trading rounds, net profits, and fee consumption
              {isLive && (
                <span className="ml-2 text-emerald-profit font-semibold">• Live Data</span>
              )}
            </p>
          </div>
        </div>

        <button
          onClick={handleExportCsv}
          disabled={sortedMonthly.length === 0}
          className="px-4 py-2 rounded-xl bg-pitch-surface border border-pitch-border text-xs text-zinc-300 font-mono hover:text-white hover:border-electric-blue/50 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV Report
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="p-5 rounded-2xl bg-pitch-card border border-pitch-border space-y-2">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{stat.title}</span>
            <p className={`text-2xl font-extrabold font-mono ${stat.color}`}>{stat.value}</p>
            <span className="text-[11px] text-zinc-500 block font-mono">{stat.sub}</span>
          </div>
        ))}
      </div>

      {/* Monthly Breakdown Table */}
      <div className="p-6 rounded-2xl bg-pitch-card border border-pitch-border space-y-4">
        <div className="flex items-center justify-between border-b border-pitch-border pb-4">
          <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-neon-purple" />
            Monthly Strategy Returns
          </h3>
          <span className="text-xs text-zinc-500 font-mono">Net PnL (After Exchange Fees)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-pitch-border text-zinc-400 uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Month</th>
                <th className="py-3 px-4">Completed Rounds</th>
                <th className="py-3 px-4">Realized PnL</th>
                <th className="py-3 px-4">Fees Paid</th>
                <th className="py-3 px-4 text-right">Net PnL (USDT)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pitch-border/50 text-zinc-200">
              {sortedMonthly.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-600">
                    No completed trading rounds yet.
                  </td>
                </tr>
              ) : (
                sortedMonthly.map((m, idx) => (
                  <tr key={idx} className="hover:bg-pitch-surface/40 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-white">{formatMonth(m.month)}</td>
                    <td className="py-3.5 px-4 text-electric-blue font-bold">
                      {m.rounds} {m.rounds === 1 ? 'Round' : 'Rounds'}
                    </td>
                    <td className={`py-3.5 px-4 ${pnlColor(m.realizedPnlUsdt)}`}>
                      {m.realizedPnlUsdt >= 0 ? '+' : ''}${m.realizedPnlUsdt.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400">${m.feesUsdt.toFixed(2)}</td>
                    <td className={`py-3.5 px-4 text-right font-extrabold ${pnlColor(m.netPnlUsdt)}`}>
                      {m.netPnlUsdt >= 0 ? '+' : ''}${m.netPnlUsdt.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer summary */}
        {sortedMonthly.length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-pitch-border text-xs font-mono">
            <span className="text-zinc-500">
              {analytics.totalRounds} Total Rounds •{' '}
              {analytics.activeStrategiesCount} Active {analytics.activeStrategiesCount === 1 ? 'Strategy' : 'Strategies'}
            </span>
            <span className={`font-bold ${pnlColor(analytics.netPnlUsdt)}`}>
              Total Net: {analytics.netPnlUsdt >= 0 ? '+' : ''}${analytics.netPnlUsdt.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
