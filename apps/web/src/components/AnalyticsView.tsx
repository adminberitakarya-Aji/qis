'use client';

import React from 'react';
import { BarChart3, Award } from 'lucide-react';

export const AnalyticsView: React.FC = () => {
  const stats = [
    { title: 'Total Realized PnL', value: '+$1,420.50', sub: '+14.2% Total Capital', color: 'text-emerald-400', isPositive: true },
    { title: 'Total Fees Paid', value: '$84.20', sub: 'Est. 0.1% Spot Fee', color: 'text-zinc-300', isPositive: false },
    { title: 'Win Rate', value: '94.2%', sub: '28 / 30 rounds profitable', color: 'text-electric-blue', isPositive: true },
    { title: 'Max Historical Drawdown', value: '3.1%', sub: 'Capital floor protected', color: 'text-amber-400', isPositive: false },
  ];

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
            <p className="text-xs text-zinc-400">Detailed break-down of trading rounds, net profits, and fee consumption</p>
          </div>
        </div>

        <button className="px-4 py-2 rounded-xl bg-pitch-surface border border-pitch-border text-xs text-zinc-300 font-mono hover:text-white transition-all">
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
              <tr className="hover:bg-pitch-surface/40 transition-colors">
                <td className="py-3.5 px-4 font-bold text-white">2026 - August</td>
                <td className="py-3.5 px-4 text-electric-blue font-bold">18 Rounds</td>
                <td className="py-3.5 px-4 text-emerald-400">+$840.50</td>
                <td className="py-3.5 px-4 text-zinc-400">$48.10</td>
                <td className="py-3.5 px-4 text-right text-emerald-400 font-extrabold">+$792.40</td>
              </tr>
              <tr className="hover:bg-pitch-surface/40 transition-colors">
                <td className="py-3.5 px-4 font-bold text-white">2026 - July</td>
                <td className="py-3.5 px-4 text-electric-blue font-bold">12 Rounds</td>
                <td className="py-3.5 px-4 text-emerald-400">+$664.20</td>
                <td className="py-3.5 px-4 text-zinc-400">$36.10</td>
                <td className="py-3.5 px-4 text-right text-emerald-400 font-extrabold">+$628.10</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
