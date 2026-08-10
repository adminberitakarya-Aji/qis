'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  OctagonX,
  RefreshCw,
  Loader2,
  WifiOff,
} from 'lucide-react';
import type { ActiveStrategy, GridOrder } from '@/lib/api';
import { getActiveStrategies, getStrategyOrders, stopExecution } from '@/lib/api';

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/** Map DB status string → display label */
function statusLabel(status: GridOrder['status']): string {
  const map: Record<GridOrder['status'], string> = {
    pending: 'Waiting for Level',
    buy_placed: 'Buy Placed',
    buy_filled: 'Buy Executed',
    tp_placed: 'TP Placed',
    tp_filled: 'Completed',
    cancelled: 'Cancelled',
    error: 'Error',
  };
  return map[status] ?? status;
}

/** Compute average slippage across orders that have a slippage value */
function avgSlippage(orders: GridOrder[]): string {
  const valid = orders.filter((o) => o.slippagePercent !== null);
  if (valid.length === 0) return '—';
  const avg = valid.reduce((s, o) => s + (o.slippagePercent ?? 0), 0) / valid.length;
  return `${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%`;
}

export const TradingView: React.FC = () => {
  const [strategy, setStrategy] = useState<ActiveStrategy | null>(null);
  const [orders, setOrders] = useState<GridOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [strategyStatus, setStrategyStatus] = useState<'active' | 'stopped'>('active');
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // ------------------------------------------------------------------
  // Fetch active strategy + its orders
  // ------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    const strategies = await getActiveStrategies();

    if (!strategies || strategies.length === 0) {
      setStrategy(null);
      setOrders([]);
      setIsLive(false);
      setIsLoading(false);
      setLastSync(new Date());
      return;
    }

    // Use the first active strategy
    const active = strategies[0];
    setStrategy(active);
    setStrategyStatus('active');

    const orderData = await getStrategyOrders(active.id);
    if (orderData) {
      // Sort by globalIndex ascending
      const sorted = [...orderData].sort((a, b) => a.globalIndex - b.globalIndex);
      setOrders(sorted);
      setIsLive(true);
    } else {
      setOrders([]);
      setIsLive(false);
    }

    setIsLoading(false);
    setLastSync(new Date());
  }, []);

  // Initial load
  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      void fetchData();
    }, 5_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ------------------------------------------------------------------
  // Stop strategy
  // ------------------------------------------------------------------
  const handleStopStrategy = async () => {
    if (!strategy) return;
    setIsStopping(true);
    const result = await stopExecution(strategy.id);
    if (result) {
      setStrategyStatus('stopped');
    }
    setIsStopping(false);
  };

  // ------------------------------------------------------------------
  // Derived stats from real orders
  // ------------------------------------------------------------------
  const completedOrders = orders.filter((o) => o.status === 'tp_filled');
  const activePositions = orders.filter(
    (o) => o.status === 'buy_filled' || o.status === 'tp_placed',
  );
  const totalRealizedPnl = completedOrders.reduce((s, o) => s + (o.realizedPnl ?? 0), 0);
  const slippage = avgSlippage(orders.filter((o) => o.slippagePercent !== null));

  // ------------------------------------------------------------------
  // Loading skeleton
  // ------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="p-8 space-y-8 bg-pitch-bg text-zinc-100 max-w-[1600px] mx-auto animate-pulse">
        <div className="p-6 rounded-2xl bg-pitch-card border border-pitch-border h-24" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-5 rounded-2xl bg-pitch-card border border-pitch-border h-20" />
          ))}
        </div>
        <div className="p-6 rounded-2xl bg-pitch-card border border-pitch-border h-64" />
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Empty state — no active strategy
  // ------------------------------------------------------------------
  if (!strategy) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <div className="p-5 rounded-2xl bg-pitch-card border border-pitch-border">
          <WifiOff className="w-10 h-10 text-zinc-600 mx-auto" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white mb-1">No Active Grid Strategy</h3>
          <p className="text-sm text-zinc-500 max-w-sm">
            {isLive
              ? 'No active strategies found. Build and approve one from AI Strategy.'
              : 'Unable to reach the backend. Please check that the API is running.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 bg-pitch-bg text-zinc-100 max-w-[1600px] mx-auto">
      {/* Top Banner & Control Header */}
      <div className="p-6 rounded-2xl bg-pitch-card border border-pitch-border flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-electric-blue/15 text-electric-blue flex items-center justify-center border border-electric-blue/30 glow-blue">
            <LineChart className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white font-mono">{strategy.pair} Grid Session</h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  strategyStatus === 'active'
                    ? 'bg-emerald-profit/15 text-emerald-profit border border-emerald-profit/30'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}
              >
                {strategyStatus === 'active' ? '● RUNNING' : 'STOPPED'}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              {strategy.exchange.charAt(0).toUpperCase() + strategy.exchange.slice(1)} Spot •{' '}
              {strategy.sectionCount} Sections •{' '}
              {strategy.totalGridLevels ?? orders.length} Grid Levels
            </p>
          </div>
        </div>

        {/* Emergency Stop Button */}
        {strategyStatus === 'active' ? (
          <button
            onClick={() => void handleStopStrategy()}
            disabled={isStopping}
            className="px-5 py-3 rounded-xl bg-red-950/80 hover:bg-red-900 text-red-400 border border-red-800/80 font-bold text-xs shadow-lg transition-all flex items-center gap-2"
          >
            <OctagonX className="w-4 h-4" />
            <span>{isStopping ? 'Canceling Orders...' : 'Emergency Stop Strategy'}</span>
          </button>
        ) : (
          <div className="text-xs font-semibold text-zinc-500">Strategy Stopped</div>
        )}
      </div>

      {/* Grid Execution Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-pitch-card border border-pitch-border">
          <div className="text-xs text-zinc-400 font-medium mb-1">Allocated Capital</div>
          <div className="text-xl font-black text-white font-mono">
            ${strategy.capital.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-zinc-500">USDT Spot Balance</div>
        </div>
        <div className="p-5 rounded-2xl bg-pitch-card border border-pitch-border">
          <div className="text-xs text-zinc-400 font-medium mb-1">Realized Net Profit</div>
          <div className={`text-xl font-black font-mono ${totalRealizedPnl >= 0 ? 'text-emerald-profit' : 'text-red-400'}`}>
            {totalRealizedPnl >= 0 ? '+' : ''}${totalRealizedPnl.toFixed(2)}
          </div>
          <div className="text-[11px] text-emerald-profit/80">{completedOrders.length} Completed Rounds</div>
        </div>
        <div className="p-5 rounded-2xl bg-pitch-card border border-pitch-border">
          <div className="text-xs text-zinc-400 font-medium mb-1">Active Positions</div>
          <div className="text-xl font-black text-white font-mono">{activePositions.length} Open Positions</div>
          <div className="text-[11px] text-zinc-500">Buy Filled, TP Placed</div>
        </div>
        <div className="p-5 rounded-2xl bg-pitch-card border border-pitch-border">
          <div className="text-xs text-zinc-400 font-medium mb-1">Avg Execution Slippage</div>
          <div className="text-xl font-black text-electric-blue font-mono">{slippage}</div>
          <div className="text-[11px] text-zinc-500">Instant Market Orders</div>
        </div>
      </div>

      {/* Instant Execution Order Status Table */}
      <div className="p-6 rounded-2xl bg-pitch-card border border-pitch-border space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-white">Live Grid Orders & Execution Log</h3>
            <p className="text-xs text-zinc-400">
              Displays grid_price, executed_price, slippage, and tp_price per grid level
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isLive ? (
              <RefreshCw className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
            ) : (
              <Loader2 className="w-3.5 h-3.5 text-zinc-500" />
            )}
            <span className="text-xs text-zinc-500 font-mono">
              {lastSync ? `Synced ${lastSync.toLocaleTimeString()}` : 'Auto-sync 5s'}
            </span>
          </div>
        </div>

        {/* Table */}
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-600 gap-2">
            <LineChart className="w-8 h-8" />
            <p className="text-sm">No orders found for this strategy.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-pitch-border text-zinc-500 uppercase tracking-wider font-mono">
                  <th className="py-3 px-4">Order #</th>
                  <th className="py-3 px-4">Section</th>
                  <th className="py-3 px-4">Grid Price</th>
                  <th className="py-3 px-4">Executed Price</th>
                  <th className="py-3 px-4">Slippage</th>
                  <th className="py-3 px-4">TP Price</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Realized PnL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pitch-border font-mono">
                {orders.map((row) => (
                  <tr key={row.id} className="hover:bg-pitch-surface/60 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-zinc-300">#{row.globalIndex}</td>
                    <td className="py-3.5 px-4 text-zinc-400">Section {row.sectionIndex + 1}</td>
                    <td className="py-3.5 px-4 text-white font-bold">
                      ${Number(row.gridPrice).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-zinc-300">
                      {row.buyFilledPrice
                        ? `$${Number(row.buyFilledPrice).toLocaleString()}`
                        : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-electric-blue">
                      {row.slippagePercent !== null
                        ? `${row.slippagePercent >= 0 ? '+' : ''}${Number(row.slippagePercent).toFixed(2)}%`
                        : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-neon-purple font-bold">
                      ${Number(row.tpPrice).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          row.status === 'tp_filled'
                            ? 'bg-emerald-profit/15 text-emerald-profit border border-emerald-profit/30'
                            : row.status === 'tp_placed'
                            ? 'bg-neon-purple/15 text-neon-purple border border-neon-purple/30'
                            : row.status === 'buy_filled'
                            ? 'bg-electric-blue/15 text-electric-blue border border-electric-blue/30'
                            : row.status === 'buy_placed'
                            ? 'bg-amber-400/15 text-amber-400 border border-amber-400/30'
                            : row.status === 'error'
                            ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                            : 'bg-pitch-surface text-zinc-500 border border-pitch-border'
                        }`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-profit">
                      {row.realizedPnl !== null ? `+$${Number(row.realizedPnl).toFixed(2)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
