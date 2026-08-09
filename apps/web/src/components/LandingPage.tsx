'use client';

import React from 'react';
import { 
  Bot, 
  ShieldCheck, 
  Zap, 
  TestTube, 
  TrendingUp, 
  ArrowRight, 
  Lock, 
  Activity,
  Sparkles,
  ChevronRight
} from 'lucide-react';

interface LandingPageProps {
  onOpenLogin: () => void;
  onOpenRegister: () => void;
}

export function LandingPage({ onOpenLogin, onOpenRegister }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-pitch-bg text-zinc-100 flex flex-col selection:bg-indigo-500 selection:text-white font-sans">
      {/* Background Decorative Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl"></div>
        <div className="absolute bottom-10 left-1/3 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:32px_32px] opacity-20"></div>
      </div>

      {/* Header Navigation */}
      <header className="relative z-10 sticky top-0 backdrop-blur-xl bg-pitch-bg/80 border-b border-zinc-800/60">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Zap className="w-5 h-5 text-white fill-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-xl tracking-tight text-white">QIS</span>
                <span className="text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 uppercase">PRO</span>
              </div>
              <p className="text-[10px] text-zinc-400 -mt-1 font-medium">AI-Assisted Grid Trading</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-zinc-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
            <a href="#paper-trading" className="hover:text-white transition-colors">Paper Trading</a>
            <a href="#security" className="hover:text-white transition-colors">Security</a>
          </nav>

          <div className="flex items-center space-x-4">
            <button
              onClick={onOpenLogin}
              className="text-sm font-medium text-zinc-300 hover:text-white px-4 py-2 rounded-lg transition-colors hover:bg-zinc-800/60"
            >
              Sign In
            </button>
            <button
              onClick={onOpenRegister}
              className="text-sm font-medium text-white px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 shadow-lg shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Get Started Free
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 pt-20 pb-24 px-6 max-w-7xl mx-auto text-center flex flex-col items-center">
        {/* Release Tag */}
        <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium mb-8 backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
          <span>Next-Gen Autonomous Trading v1.0 — Now Live</span>
          <ChevronRight className="w-3.5 h-3.5 text-indigo-400" />
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold text-white tracking-tight max-w-5xl leading-[1.1] mb-6">
          Autonomous Grid Trading Powered by <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">AI Intelligence</span>
        </h1>

        {/* Philosophy Core */}
        <p className="text-lg md:text-xl text-zinc-300 max-w-3xl mb-8 leading-relaxed font-normal">
          <span className="text-white font-medium">AI analyzes. AI recommends. Trader decides. System executes.</span><br />
          Tingkatkan performa trading crypto Anda dengan jaringan grid otomatis, proteksi modal berbasis volatilitas, dan eksekusi instan 24/7.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 w-full sm:w-auto">
          <button
            onClick={onOpenRegister}
            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold shadow-xl shadow-indigo-500/25 flex items-center justify-center space-x-3 transition-all hover:scale-105"
          >
            <TestTube className="w-5 h-5" />
            <span>Start Free Paper Trading ($100)</span>
            <ArrowRight className="w-5 h-5" />
          </button>

          <button
            onClick={onOpenLogin}
            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 font-semibold flex items-center justify-center space-x-2 transition-all"
          >
            <span>Sign In to Dashboard</span>
          </button>
        </div>

        {/* Live Interactive Grid Demo Preview */}
        <div className="w-full max-w-5xl rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 md:p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping"></div>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Live Strategy Simulation</span>
              <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">BTC/USDT • Binance</span>
            </div>
            <div className="flex items-center space-x-4 text-xs text-zinc-400">
              <span>AI Score: <strong className="text-emerald-400">92/100</strong></span>
              <span>Virtual Balance: <strong className="text-white">$100.00</strong></span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
            <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
              <div className="text-xs text-zinc-400 mb-1">RSI (14) Indicator</div>
              <div className="text-xl font-bold text-white mb-2">42.5 <span className="text-xs font-normal text-emerald-400">Normal Range</span></div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500" style={{ width: '42.5%' }}></div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
              <div className="text-xs text-zinc-400 mb-1">Sideways Score</div>
              <div className="text-xl font-bold text-white mb-2">88% <span className="text-xs font-normal text-indigo-400">Optimal Grid</span></div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: '88%' }}></div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
              <div className="text-xs text-zinc-400 mb-1">Protection Floor</div>
              <div className="text-xl font-bold text-white mb-2">$91,200 <span className="text-xs font-normal text-purple-400">Dynamic</span></div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500" style={{ width: '75%' }}></div>
              </div>
            </div>
          </div>

          {/* Grid Level Visualization Tickers */}
          <div className="mt-6 p-4 rounded-xl bg-zinc-950/80 border border-zinc-800/60 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2 text-zinc-300">
              <Activity className="w-4 h-4 text-indigo-400" />
              <span>Grid Levels: <strong>12 Sections</strong></span>
            </div>
            <div className="flex items-center space-x-2 text-zinc-300">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>Target Profit / Grid: <strong>1.5% - 2.2%</strong></span>
            </div>
            <div className="flex items-center space-x-2 text-zinc-300">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Execution: <strong>Instant Market Trigger</strong></span>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features Grid Section */}
      <section id="features" className="relative z-10 py-20 px-6 max-w-7xl mx-auto w-full">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Kenapa Memilih Platform Qis?</h2>
          <p className="text-zinc-400 max-w-2xl mx-auto text-base">
            Dirancang khusus untuk trader modern yang membutuhkan kombinasi analitik cerdas AI dan disiplin eksekusi tanpa emosi.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Card 1 */}
          <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-indigo-500/50 transition-all hover:-translate-y-1">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mb-6 text-indigo-400">
              <Bot className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">AI Engine Recommendation</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Kombinasi analisis indikator teknikal (RSI, Bollinger Bands, ATR%) dan kecerdasan LLM (OpenAI, Anthropic, Gemini) untuk merekomendasikan pair terbaik.
            </p>
          </div>

          {/* Card 2 */}
          <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-purple-500/50 transition-all hover:-translate-y-1">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mb-6 text-purple-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Dynamic Floor Protection</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Batas proteksi modal dihitung secara dinamis berdasarkan volatilitas pasar untuk mencegah kecelakaan drawdown mendalam saat kondisi pasar crash.
            </p>
          </div>

          {/* Card 3 */}
          <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-blue-500/50 transition-all hover:-translate-y-1">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-6 text-blue-400">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Instant Market Execution</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Tanpa antrian limit order yang lambat. Sistem mentrigger order MARKET secara instan begitu harga menyentuh garis grid untuk eksekusi terjamin.
            </p>
          </div>

          {/* Card 4 */}
          <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-emerald-500/50 transition-all hover:-translate-y-1">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-6 text-emerald-400">
              <TestTube className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">24/7 Paper Trading</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Uji coba strategi dengan modal virtual $100 pada harga live pasar tanpa risiko uang nyata, dilengkapi notifikasi Telegram secara real-time.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="relative z-10 py-20 px-6 max-w-7xl mx-auto w-full border-t border-zinc-800/60">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Cara Kerja 3-Langkah</h2>
          <p className="text-zinc-400 max-w-2xl mx-auto text-base">
            Mulai trading otomatis hanya dalam beberapa menit dengan alur kerja yang transparan.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          <div className="p-8 rounded-2xl bg-zinc-900/60 border border-zinc-800 relative">
            <div className="text-4xl font-extrabold text-indigo-500/30 mb-4">01</div>
            <h3 className="text-lg font-bold text-white mb-2">AI Analyzes & Recommends</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              AI Service menganalisis indikator teknikal pasar dan memberikan rekomendasi pair serta parameter Blueprint strategi terpadu.
            </p>
          </div>

          <div className="p-8 rounded-2xl bg-zinc-900/60 border border-zinc-800 relative">
            <div className="text-4xl font-extrabold text-purple-500/30 mb-4">02</div>
            <h3 className="text-lg font-bold text-white mb-2">Trader Approves Strategy</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Anda meninjau Blueprint rekomendasi AI, menyesuaikan alokasi modal, dan memilih mode Paper Trading atau Live Exchange.
            </p>
          </div>

          <div className="p-8 rounded-2xl bg-zinc-900/60 border border-zinc-800 relative">
            <div className="text-4xl font-extrabold text-blue-500/30 mb-4">03</div>
            <h3 className="text-lg font-bold text-white mb-2">System Executes 24/7</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Worker WebSocket memantau pergerakan harga pasar secara real-time dan mentrigger eksekusi order serta notifikasi Telegram otomatis.
            </p>
          </div>
        </div>
      </section>

      {/* Security & Envelope Encryption Banner */}
      <section id="security" className="relative z-10 py-16 px-6 max-w-7xl mx-auto w-full">
        <div className="p-8 md:p-12 rounded-3xl bg-gradient-to-r from-zinc-900 via-indigo-950/40 to-zinc-900 border border-indigo-500/20 flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl">
          <div className="max-w-2xl">
            <div className="inline-flex items-center space-x-2 text-indigo-400 text-xs font-semibold tracking-wider uppercase mb-3">
              <Lock className="w-4 h-4" />
              <span>Enterprise Grade Security</span>
            </div>
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">AES-256-GCM Envelope Encryption</h3>
            <p className="text-sm text-zinc-300 leading-relaxed">
              API key exchange Anda disimpan terenkripsi secara aman dengan algoritma envelope encryption. Dekripsi hanya terjadi di memori sementara saat eksekusi transaksi, tanpa pernah bocor ke log atau tampilan publik.
            </p>
          </div>

          <div className="flex-shrink-0">
            <button
              onClick={onOpenRegister}
              className="px-6 py-3.5 rounded-xl bg-white text-zinc-950 font-semibold hover:bg-zinc-100 transition-all shadow-lg"
            >
              Coba Paper Trading Sekarang
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-zinc-800/80 py-12 px-6 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-zinc-500">
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">Q</div>
            <span>© 2026 Qis Platform — AI-Assisted Grid Trading. All rights reserved.</span>
          </div>

          <div className="flex items-center space-x-6">
            <span>Binance & Bybit Integration</span>
            <span>Telegram Bot Alerts</span>
            <span>Paper Trading Virtual $100</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
