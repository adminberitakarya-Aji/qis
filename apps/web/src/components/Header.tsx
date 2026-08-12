'use client';

import React, { useState } from 'react';
import {
  Wallet,
  ChevronDown,
  Activity,
  Bell,
  ShieldCheck,
  LogOut,
  FlaskConical,
} from 'lucide-react';
import type { User as AuthUser } from '@/lib/auth';
import type { TradingMode } from '@/lib/api';

interface HeaderProps {
  title: string;
  selectedExchange: 'binance' | 'bybit';
  setSelectedExchange: (exchange: 'binance' | 'bybit') => void;
  tradingMode: TradingMode;
  setTradingMode: (mode: TradingMode) => void;
  realtimeStatus?: 'connecting' | 'connected' | 'disconnected';
  user?: AuthUser | null;
  onLogout?: () => void;
  /** Live total capital across all active strategies (USDT). null = still loading. */
  totalCapital?: number | null;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  selectedExchange,
  setSelectedExchange,
  tradingMode,
  setTradingMode,
  realtimeStatus = 'disconnected',
  user,
  onLogout,
  totalCapital,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const isPaper = tradingMode === 'paper';

  return (
    <header className="h-16 bg-pitch-bg border-b border-pitch-border px-8 flex items-center justify-between sticky top-0 z-20">
      {/* Title */}
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
        <div
          className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold border ${isPaper
            ? 'bg-pitch-hover/60 border-pitch-border text-zinc-400'
            : 'bg-emerald-profit/10 border-emerald-profit/20 text-emerald-profit'
            }`}
        >
          {isPaper ? <FlaskConical className="w-3.5 h-3.5" /> : <Activity className="w-3.5 h-3.5 animate-pulse" />}
          <span>{isPaper ? 'Paper Execution Engine' : 'Live Execution Engine'}</span>
        </div>
        {/* Realtime Connection Status — a genuine three-state health signal
            (connected/connecting/disconnected), so red/amber/emerald here
            follows the same convention as any uptime or CI status badge. */}
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-mono font-bold ${realtimeStatus === 'connected'
          ? 'bg-emerald-profit/10 border border-emerald-profit/30 text-emerald-profit'
          : realtimeStatus === 'connecting'
            ? 'bg-amber-400/10 border border-amber-400/30 text-amber-400'
            : 'bg-crimson-loss/10 border border-crimson-loss/30 text-crimson-loss'
          }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${realtimeStatus === 'connected' ? 'bg-emerald-profit' :
            realtimeStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-crimson-loss'
            }`} />
          {realtimeStatus === 'connected' ? 'WS Live' :
            realtimeStatus === 'connecting' ? 'Connecting...' : 'WS Off'}
        </div>
      </div>

      {/* Right Tools */}
      <div className="flex items-center gap-6">
        {/* Trading Mode Toggle — Live vs Paper (Virtual Balance) */}
        <div
          role="tablist"
          aria-label="Trading mode"
          className="flex items-center p-0.5 rounded-xl bg-pitch-surface border border-pitch-border"
        >
          <button
            role="tab"
            aria-selected={!isPaper}
            onClick={() => setTradingMode('live')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${!isPaper
              ? 'bg-electric-blue/15 text-electric-blue shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300'
              }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${!isPaper ? 'bg-electric-blue' : 'bg-zinc-600'}`} />
            Live Trading
          </button>
          <button
            role="tab"
            aria-selected={isPaper}
            onClick={() => setTradingMode('paper')}
            title="Simulated trading with a $100 virtual balance — no real money, no API key required"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isPaper
              ? 'bg-electric-blue/15 text-electric-blue shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300'
              }`}
          >
            <FlaskConical className="w-3 h-3" />
            Paper Trading
          </button>
        </div>

        {/* Exchange Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-pitch-surface border border-pitch-border text-sm font-medium text-zinc-200 hover:border-pitch-borderLight transition-all"
          >
            <ShieldCheck className="w-4 h-4 text-electric-blue" />
            <span className="capitalize">{selectedExchange} Spot</span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-44 bg-pitch-card border border-pitch-border rounded-xl shadow-xl z-50 p-1">
              <button
                onClick={() => {
                  setSelectedExchange('binance');
                  setIsDropdownOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-medium rounded-lg flex items-center justify-between ${selectedExchange === 'binance'
                  ? 'bg-electric-blue/15 text-electric-blue font-bold'
                  : 'text-zinc-300 hover:bg-pitch-surface'
                  }`}
              >
                <span>Binance Spot</span>
                {selectedExchange === 'binance' && <span className="w-1.5 h-1.5 rounded-full bg-electric-blue"></span>}
              </button>
              <button
                onClick={() => {
                  setSelectedExchange('bybit');
                  setIsDropdownOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-medium rounded-lg flex items-center justify-between ${selectedExchange === 'bybit'
                  ? 'bg-electric-blue/15 text-electric-blue font-bold'
                  : 'text-zinc-300 hover:bg-pitch-surface'
                  }`}
              >
                <span>Bybit Spot</span>
                {selectedExchange === 'bybit' && <span className="w-1.5 h-1.5 rounded-full bg-electric-blue"></span>}
              </button>
            </div>
          )}
        </div>

        {/* Global Balance */}
        <div className="flex items-center gap-3 px-4 py-1.5 rounded-xl bg-pitch-surface border border-pitch-border">
          <div className="p-1.5 rounded-lg bg-electric-blue/15 text-electric-blue">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider leading-none">
              {isPaper ? 'Virtual Balance' : 'Total Capital'}
            </div>
            <div className="text-sm font-extrabold text-white leading-tight font-mono">
              {totalCapital === null || totalCapital === undefined ? (
                // Skeleton while loading
                <span className="inline-block h-3.5 w-24 rounded bg-pitch-card animate-pulse align-middle" />
              ) : (
                <>
                  ${totalCapital.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                  <span className="text-[11px] text-zinc-500 font-normal">USDT</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Notification Bell & Profile */}
        <button className="p-2 rounded-xl bg-pitch-surface border border-pitch-border text-zinc-400 hover:text-white transition-colors relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-electric-blue"></span>
        </button>

        {/* User Profile with Logout */}
        <div className="relative">
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 pl-2 border-l border-pitch-border hover:bg-pitch-surface rounded-xl py-1.5 pr-2 transition-colors"
          >
            <div className="w-8 h-8 rounded-xl bg-electric-blue/15 border border-electric-blue/20 flex items-center justify-center text-electric-blue font-bold text-xs">
              {user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="text-left">
              <div className="font-semibold text-zinc-200 text-xs">
                {user?.name || user?.email || 'User'}
              </div>
              <div className="text-[10px] text-zinc-500">Signed In</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-pitch-card border border-pitch-border rounded-xl shadow-xl z-50 p-1">
              <div className="px-3 py-2.5 border-b border-pitch-border mb-1">
                <div className="text-xs font-semibold text-zinc-200 truncate">
                  {user?.name || 'User'}
                </div>
                <div className="text-[10px] text-zinc-500 truncate">
                  {user?.email || ''}
                </div>
              </div>
              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  onLogout?.();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg text-crimson-loss hover:bg-crimson-loss/10 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
