'use client';

import React from 'react';
import { PieChart } from 'lucide-react';

export const PortfolioView: React.FC = () => {
  const assetBreakdown = [
    { asset: 'USDT', balance: '25,480.50', allocation: '56.2%', value: '$25,480.50' },
    { asset: 'BTC', balance: '0.185', allocation: '32.1%', value: '$14,520.00' },
    { asset: 'ETH', balance: '1.250', allocation: '7.8%', value: '$3,520.00' },
    { asset: 'SOL', balance: '8.200', allocation: '3.9%', value: '$1,760.00' },
  ];

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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Asset Allocation Breakdown */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-pitch-card border border-pitch-border space-y-6">
          <h3 className="text-base font-extrabold text-white">Asset Balance Breakdown</h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-pitch-border text-zinc-500 uppercase tracking-wider font-mono">
                  <th className="py-3 px-4">Asset</th>
                  <th className="py-3 px-4">Total Balance</th>
                  <th className="py-3 px-4">Allocation %</th>
                  <th className="py-3 px-4 text-right">Est. USDT Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pitch-border font-mono">
                {assetBreakdown.map((item, idx) => (
                  <tr key={idx} className="hover:bg-pitch-surface/60 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-electric-blue"></span>
                      {item.asset}
                    </td>
                    <td className="py-3.5 px-4 text-zinc-300">{item.balance}</td>
                    <td className="py-3.5 px-4 text-neon-purple font-bold">{item.allocation}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-white">{item.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Capital Allocation per Strategy */}
        <div className="p-6 rounded-2xl bg-pitch-card border border-pitch-border space-y-4">
          <h3 className="text-base font-extrabold text-white">Strategy Capital Usage</h3>
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-pitch-surface border border-pitch-border space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-white font-mono">BTC/USDT Strategy</span>
                <span className="text-emerald-profit font-bold font-mono">+$248.50</span>
              </div>
              <div className="text-xs text-zinc-400 font-mono">Capital: $10,000.00 (Active)</div>
            </div>
            <div className="p-4 rounded-xl bg-pitch-surface border border-pitch-border space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-white font-mono">ETH/USDT Strategy</span>
                <span className="text-emerald-profit font-bold font-mono">+$94.30</span>
              </div>
              <div className="text-xs text-zinc-400 font-mono">Capital: $5,000.00 (Active)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
