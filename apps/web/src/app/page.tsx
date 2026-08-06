'use client';

import React, { useState } from 'react';
import { Sidebar, NavTab } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { DashboardView } from '@/components/DashboardView';
import { AiStrategyView } from '@/components/AiStrategyView';
import { TradingView } from '@/components/TradingView';
import { PortfolioView } from '@/components/PortfolioView';
import { AnalyticsView } from '@/components/AnalyticsView';
import { ExchangesView } from '@/components/ExchangesView';

const PAGE_TITLES: Record<NavTab, string> = {
  dashboard: 'Dashboard',
  'ai-strategy': 'AI Strategy Builder',
  trading: 'Live Trading Grid',
  portfolio: 'Portfolio',
  analytics: 'Performance Analytics',
  exchanges: 'Exchange Accounts',
  settings: 'Settings',
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedExchange, setSelectedExchange] = useState<'binance' | 'bybit'>('binance');
  const [strategyPair, setStrategyPair] = useState<string | undefined>(undefined);

  const handleNavigateToStrategy = (pair?: string) => {
    setStrategyPair(pair);
    setActiveTab('ai-strategy');
  };

  const handleStrategyApproved = () => {
    setActiveTab('trading');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView onNavigateToStrategy={handleNavigateToStrategy} />;
      case 'ai-strategy':
        return (
          <AiStrategyView
            key={strategyPair}
            initialPair={strategyPair ?? 'BTC/USDT'}
            onStrategyApproved={handleStrategyApproved}
          />
        );
      case 'trading':
        return <TradingView />;
      case 'portfolio':
        return <PortfolioView />;
      case 'analytics':
        return <AnalyticsView />;
      case 'exchanges':
        return <ExchangesView />;
      case 'settings':
        return (
          <div className="p-8 text-zinc-400 text-sm">
            Settings — Coming Soon
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-pitch-bg">
      {/* Left Sidebar Navigation */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          title={PAGE_TITLES[activeTab]}
          selectedExchange={selectedExchange}
          setSelectedExchange={setSelectedExchange}
        />

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
