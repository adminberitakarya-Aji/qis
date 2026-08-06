'use client';

import React from 'react';
import {
  LayoutDashboard,
  BrainCircuit,
  LineChart,
  PieChart,
  BarChart3,
  Landmark,
  Settings,
  Sparkles,
  Zap,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'ai-strategy'
  | 'trading'
  | 'portfolio'
  | 'analytics'
  | 'exchanges'
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'ai-strategy', label: 'AI Strategy', icon: BrainCircuit, badge: 'AI Assisting' },
    { id: 'trading', label: 'Trading Grid', icon: LineChart, badge: 'Instant' },
    { id: 'portfolio', label: 'Portfolio', icon: PieChart },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'exchanges', label: 'Exchanges', icon: Landmark },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-pitch-bg border-r border-pitch-border flex flex-col h-screen sticky top-0 z-30 select-none">
      {/* Brand Logo */}
      <div className="p-6 border-b border-pitch-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-electric-blue via-indigo-600 to-neon-purple flex items-center justify-center shadow-lg glow-blue">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-wider text-white flex items-center gap-1.5">
              QIS <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-electric-blue/20 text-electric-blue border border-electric-blue/30">PRO</span>
            </h1>
            <p className="text-[11px] text-zinc-500 font-medium">AI-Assisted Grid Trading</p>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
          Core Engine Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as NavTab)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${
                isActive
                  ? 'bg-pitch-surface text-white border border-pitch-borderLight shadow-md glow-blue'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-pitch-card'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? 'text-electric-blue' : 'text-zinc-500'
                  }`}
                />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    item.badge === 'AI Assisting'
                      ? 'bg-neon-purple/15 text-neon-purple border border-neon-purple/30'
                      : 'bg-emerald-profit/15 text-emerald-profit border border-emerald-profit/30'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Banner */}
      <div className="p-4 border-t border-pitch-border">
        <div className="p-3.5 rounded-xl bg-pitch-surface border border-pitch-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-neon-purple/20 flex items-center justify-center text-neon-purple">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-200">AI Assist Philosophy</div>
            <div className="text-[10px] text-zinc-500 leading-tight">AI Plans · Trader Decides</div>
          </div>
        </div>
      </div>
    </aside>
  );
};
