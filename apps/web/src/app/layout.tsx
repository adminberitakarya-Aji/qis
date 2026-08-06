import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Qis — AI-Assisted Grid Trading Platform',
  description:
    'Qis is a professional AI-Assisted Grid Trading Platform. AI analyzes markets and recommends optimal Strategy Blueprints. Trader decides. System executes deterministically.',
  keywords: ['grid trading', 'AI trading', 'crypto trading', 'binance', 'bybit'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased bg-pitch-bg text-zinc-100`}>
        {children}
      </body>
    </html>
  );
}
