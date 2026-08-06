'use client';

import React, { useState } from 'react';
import {
  LineChart,
  OctagonX,
  RefreshCw,
} from 'lucide-react';

export const TradingView: React.FC = () => {
  const [isStopping, setIsStopping] = useState(false);
  const [strategyStatus, setStrategyStatus] = useState<'active' | 'stopped'>('active');

  const liveOrders = [
    {
      globalIndex: 1,
      sectionIndex: 1,
      gridPrice: 96400,
      executedPrice: 96405,
      slippage: '+0.01%',
      tpPrice: 97100,
      allocatedCapital: 350,
      status: 'Completed',
      realizedPnl: '4.85',
      updatedAt: '14:20:11',
    },
    {
      globalIndex: 2,
      sectionIndex: 1,
      gridPrice: 95900,
      executedPrice: 95898,
      slippage: '-0.00%',
      tpPrice: 96600,
      allocatedCapital: 350,
      status: 'Completed',
      realizedPnl: '4.92',
      updatedAt: '13:45:02',
    },
    {
      globalIndex: 3,
      sectionIndex: 1,
      gridPrice: 95400,
      executedPrice: 95402,
      slippage: '+0.00%',
      tpPrice: 96100,
      allocatedCapital: 350,
      status: 'TP Placed',
      realizedPnl: '—',
      updatedAt: '13:15:00',
    },
    {
      globalIndex: 4,
      sectionIndex: 1,
      gridPrice: 94900,
      executedPrice: 94901,
      slippage: '+0.00%',
      tpPrice: 95600,
      allocatedCapital: 350,
      status: 'Buy Executed',
      realizedPnl: '—',
      updatedAt: '12:50:22',
    },
    {
      globalIndex: 5,
      sectionIndex: 2,
      gridPrice: 93500,
      executedPrice: null,
      slippage: '—',
      tpPrice: 94300,
      allocatedCapital: 350,
      status: 'Waiting for Level',
      realizedPnl: '—',
      updatedAt: '12:00:00',
    },
    {
      globalIndex: 6,
      sectionIndex: 2,
      gridPrice: 93000,
      executedPrice: null,
      slippage: '—',
      tpPrice: 93800,
      allocatedCapital: 350,
      status: 'Waiting for Level',
      realizedPnl: '—',
      updatedAt: '12:00:00',
    },
  ];

  const handleStopStrategy = () => {
    setIsStopping(true);
    setTimeout(() => {
      setStrategyStatus('stopped');
      setIsStopping(false);
    }, 1000);
  };

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
              <h2 className="text-xl font-black text-white font-mono">BTC/USDT Grid Session</h2>
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
            <p className="text-xs text-zinc-400">Binance Spot • 3 Sections • 30 Grid Levels</p>
          </div>
        </div>

        {/* Emergency Stop Button */}
        {strategyStatus === 'active' ? (
          <button
            onClick={handleStopStrategy}
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
          <div className="text-xl font-black text-white font-mono">$10,000.00</div>
          <div className="text-[11px] text-zinc-500">USDT Spot Balance</div>
        </div>
        <div className="p-5 rounded-2xl bg-pitch-card border border-pitch-border">
          <div className="text-xs text-zinc-400 font-medium mb-1">Realized Net Profit</div>
          <div className="text-xl font-black text-emerald-profit font-mono">+$342.80</div>
          <div className="text-[11px] text-emerald-profit/80">38 Completed Rounds</div>
        </div>
        <div className="p-5 rounded-2xl bg-pitch-card border border-pitch-border">
          <div className="text-xs text-zinc-400 font-medium mb-1">Active Positions</div>
          <div className="text-xl font-black text-white font-mono">2 Open Positions</div>
          <div className="text-[11px] text-zinc-500">Buy Filled, TP Placed</div>
        </div>
        <div className="p-5 rounded-2xl bg-pitch-card border border-pitch-border">
          <div className="text-xs text-zinc-400 font-medium mb-1">Avg Execution Slippage</div>
          <div className="text-xl font-black text-electric-blue font-mono">+0.01%</div>
          <div className="text-[11px] text-zinc-500">Instant Market Orders</div>
        </div>
      </div>

      {/* Instant Execution Order Status Table (LOVABLE.md requirement) */}
      <div className="p-6 rounded-2xl bg-pitch-card border border-pitch-border space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-white">Live Grid Orders & Execution Log</h3>
            <p className="text-xs text-zinc-400">
              Displays grid_price, executed_price, slippage, and tp_price per grid level
            </p>
          </div>

          <div className="flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
            <span className="text-xs text-zinc-500 font-mono">Auto-sync 2s</span>
          </div>
        </div>

        {/* Table Container */}
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
              {liveOrders.map((row) => (
                <tr key={row.globalIndex} className="hover:bg-pitch-surface/60 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-zinc-300">#{row.globalIndex}</td>
                  <td className="py-3.5 px-4 text-zinc-400">Section {row.sectionIndex}</td>
                  <td className="py-3.5 px-4 text-white font-bold">${row.gridPrice.toLocaleString()}</td>
                  <td className="py-3.5 px-4 text-zinc-300">
                    {row.executedPrice ? `$${row.executedPrice.toLocaleString()}` : '—'}
                  </td>
                  <td className="py-3.5 px-4 text-electric-blue">{row.slippage}</td>
                  <td className="py-3.5 px-4 text-neon-purple font-bold">${row.tpPrice.toLocaleString()}</td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        row.status === 'Completed'
                          ? 'bg-emerald-profit/15 text-emerald-profit border border-emerald-profit/30'
                          : row.status === 'TP Placed'
                          ? 'bg-neon-purple/15 text-neon-purple border border-neon-purple/30'
                          : row.status === 'Buy Executed'
                          ? 'bg-electric-blue/15 text-electric-blue border border-electric-blue/30'
                          : 'bg-pitch-surface text-zinc-500 border border-pitch-border'
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-emerald-profit">
                    {row.realizedPnl !== '—' ? `+$${row.realizedPnl}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
