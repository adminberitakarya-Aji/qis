'use client';

import React, { useEffect, useState } from 'react';
import type { NavTab } from '@/components/Sidebar';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { DashboardView } from '@/components/DashboardView';
import { AiStrategyView } from '@/components/AiStrategyView';
import { TradingView } from '@/components/TradingView';
import { PortfolioView } from '@/components/PortfolioView';
import { AnalyticsView } from '@/components/AnalyticsView';
import { ExchangesView } from '@/components/ExchangesView';
import { AuthPage } from '@/components/AuthPage';
import { LandingPage } from '@/components/LandingPage';
import { realtimeClient } from '@/lib/realtime';
import type { User } from '@/lib/auth';
import { getStoredUser, clearAuth, logout, refreshTokens } from '@/lib/auth';
import { getPortfolioSummary } from '@/lib/api';

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
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authModal, setAuthModal] = useState<'login' | 'register' | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedExchange, setSelectedExchange] = useState<'binance' | 'bybit'>('binance');
  const [strategyPair, setStrategyPair] = useState<string | undefined>(undefined);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [portfolioCapital, setPortfolioCapital] = useState<number | null>(null);

  // Check authentication state on mount
  useEffect(() => {
    const storedUser = getStoredUser();
    if (storedUser) {
      setUser(storedUser);
      setAuthenticated(true);
      setCheckingAuth(false);
      // Try to refresh the token in the background
      void refreshTokens().then((auth) => {
        if (auth) {
          setUser(auth.user);
        }
      });
    } else {
      setCheckingAuth(false);
    }
  }, []);

  // Fetch real portfolio capital for the header badge
  useEffect(() => {
    if (!authenticated) return;
    const fetchCapital = async () => {
      const summary = await getPortfolioSummary();
      if (summary) setPortfolioCapital(summary.totalCapitalUsdt);
    };
    void fetchCapital();
    const interval = setInterval(() => { void fetchCapital(); }, 60_000);
    return () => clearInterval(interval);
  }, [authenticated]);

  // Connect to WebSocket when authenticated and listen for real-time events
  // Per Real-Time Data Rules (BUSINESS_RULES_ADDENDUM.md), order status,
  // portfolio, and grid status must be pushed, not polled.
  useEffect(() => {
    if (!authenticated) return;

    realtimeClient.connect();

    // Update status indicator on connect/disconnect
    const wsClient = realtimeClient as unknown as { ws?: WebSocket };
    const statusTimer = setInterval(() => {
      setRealtimeStatus(
        wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN ? 'connected' : 'disconnected'
      );
    }, 5000);

    return () => {
      clearInterval(statusTimer);
      realtimeClient.disconnect();
    };
  }, [authenticated]);

  const handleAuthSuccess = () => {
    const storedUser = getStoredUser();
    setUser(storedUser);
    setAuthenticated(true);
    setAuthModal(null);
  };

  const handleLogout = async () => {
    await logout();
    clearAuth();
    setUser(null);
    setAuthenticated(false);
    setAuthModal(null);
    setActiveTab('dashboard');
    realtimeClient.disconnect();
  };

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

  // Show loading state while checking auth
  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pitch-bg">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-electric-blue via-indigo-600 to-neon-purple flex items-center justify-center animate-pulse">
            <span className="text-white font-bold">Q</span>
          </div>
          <p className="text-sm text-zinc-500">Loading Qis...</p>
        </div>
      </div>
    );
  }

  // Show Landing Page when not authenticated, with modal auth option
  if (!authenticated) {
    return (
      <>
        <LandingPage
          onOpenLogin={() => setAuthModal('login')}
          onOpenRegister={() => setAuthModal('register')}
        />

        {authModal && (
          <AuthPage
            initialMode={authModal}
            onSuccess={handleAuthSuccess}
            onClose={() => setAuthModal(null)}
          />
        )}
      </>
    );
  }

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
          realtimeStatus={realtimeStatus}
          user={user}
          onLogout={() => void handleLogout()}
          totalCapital={portfolioCapital}
        />

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
