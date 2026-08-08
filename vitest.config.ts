import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    root: path.resolve(__dirname),
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
  },
  resolve: {
    alias: {
      '@qis/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@qis/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
      '@qis/grid-engine': path.resolve(__dirname, 'packages/engines/grid-engine/src/index.ts'),
      '@qis/ai-engine': path.resolve(__dirname, 'packages/engines/ai-engine/src/index.ts'),
      '@qis/market-engine': path.resolve(__dirname, 'packages/engines/market-engine/src/index.ts'),
      '@qis/analytics-engine': path.resolve(__dirname, 'packages/engines/analytics-engine/src/index.ts'),
      '@qis/backtest-engine': path.resolve(__dirname, 'packages/engines/backtest-engine/src/index.ts'),
      '@qis/risk-engine': path.resolve(__dirname, 'packages/engines/risk-engine/src/index.ts'),
      '@qis/exchange-engine': path.resolve(__dirname, 'packages/engines/exchange-engine/src/index.ts'),
      '@qis/logger': path.resolve(__dirname, 'packages/logger/src/index.ts'),
      '@qis/providers-ai': path.resolve(__dirname, 'packages/providers/ai/src/index.ts'),
      '@qis/providers-exchange': path.resolve(__dirname, 'packages/providers/exchange/src/index.ts'),
    },
  },
});