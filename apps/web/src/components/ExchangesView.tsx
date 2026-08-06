'use client';

import React, { useState } from 'react';
import { Landmark, ShieldCheck, Plus, Lock } from 'lucide-react';

export const ExchangesView: React.FC = () => {
  const [exchange, setExchange] = useState<'binance' | 'bybit'>('binance');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectedAccounts, setConnectedAccounts] = useState([
    { id: '1', exchange: 'binance', label: 'Main Binance Account', isActive: true, createdAt: '2026-08-01' },
    { id: '2', exchange: 'bybit', label: 'Bybit Spot Account', isActive: true, createdAt: '2026-08-03' },
  ]);

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey || !apiSecret || !label) return;

    setIsConnecting(true);
    setTimeout(() => {
      setConnectedAccounts([
        ...connectedAccounts,
        { id: String(Date.now()), exchange, label, isActive: true, createdAt: new Date().toISOString().slice(0, 10) },
      ]);
      setApiKey('');
      setApiSecret('');
      setLabel('');
      setIsConnecting(false);
    }, 1000);
  };

  return (
    <div className="p-8 space-y-8 bg-pitch-bg text-zinc-100 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-electric-blue/15 text-electric-blue border border-electric-blue/30 glow-blue">
            <Landmark className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white tracking-tight">Exchange API Key Management</h2>
            <p className="text-xs text-zinc-400">Connect Binance Spot and Bybit Spot accounts securely</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-pitch-card border border-pitch-border text-xs text-zinc-400 font-mono">
          <Lock className="w-3.5 h-3.5 text-emerald-profit" />
          <span>Secrets encrypted with AES-256-GCM (ExchangeEngine Only)</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Column */}
        <form onSubmit={handleConnect} className="p-6 rounded-2xl bg-pitch-card border border-pitch-border space-y-4">
          <h3 className="text-base font-extrabold text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-electric-blue" /> Connect New Exchange
          </h3>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-300">Exchange Platform</label>
            <select
              value={exchange}
              onChange={(e) => setExchange(e.target.value as 'binance' | 'bybit')}
              className="w-full px-4 py-2.5 rounded-xl bg-pitch-surface border border-pitch-border text-white text-sm focus:border-electric-blue outline-none"
            >
              <option value="binance">Binance Spot</option>
              <option value="bybit">Bybit Spot</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-300">Account Label</label>
            <input
              type="text"
              placeholder="e.g. My Binance Spot Account"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-pitch-surface border border-pitch-border text-white text-sm focus:border-electric-blue outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-300">API Key</label>
            <input
              type="text"
              placeholder="Paste exchange API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-pitch-surface border border-pitch-border text-white text-sm font-mono focus:border-electric-blue outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-300">API Secret</label>
            <input
              type="password"
              placeholder="Paste exchange API secret"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-pitch-surface border border-pitch-border text-white text-sm font-mono focus:border-electric-blue outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isConnecting}
            className="w-full py-3 rounded-xl bg-electric-blue hover:bg-electric-blue/90 text-white font-extrabold text-xs shadow-md glow-blue transition-all flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{isConnecting ? 'Testing Connection...' : 'Test & Connect Exchange'}</span>
          </button>
        </form>

        {/* Connected List Column */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-pitch-card border border-pitch-border space-y-4">
          <h3 className="text-base font-extrabold text-white">Connected Exchange Accounts</h3>
          <div className="space-y-3">
            {connectedAccounts.map((acc) => (
              <div key={acc.id} className="p-4 rounded-xl bg-pitch-surface border border-pitch-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-electric-blue/15 text-electric-blue flex items-center justify-center font-bold uppercase text-xs">
                    {acc.exchange.slice(0, 3)}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">{acc.label}</div>
                    <div className="text-xs text-zinc-500 font-mono uppercase">{acc.exchange} Spot • Connected {acc.createdAt}</div>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-profit/15 text-emerald-profit border border-emerald-profit/30 text-[10px] font-bold">
                  Active
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
