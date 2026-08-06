// NestJS provider for the Exchange Engine singleton.
//
// Secret Ownership Rule:
//   This is the SOLE provider of the Master Key in the entire API runtime.
//   CryptoService is instantiated once here and lives inside ExchangeEngine.
//   No other module in apps/api can import CryptoService — it is not
//   exported from this module, and no other Engine is given access to it.
//
// All other services inject EXCHANGE_ENGINE (the Exchange Engine instance)
// and call only the *Encrypted methods. Plaintext credentials never enter
// any other service or engine in the system.

import { Global, Module } from '@nestjs/common';
import { ExchangeEngine, ExchangeEngineCrypto } from '@qis/exchange-engine';
import { ExecutionEngine as ExecutionEnginePkg } from '@qis/execution-engine';
import { PortfolioEngine as PortfolioEnginePkg } from '@qis/portfolio-engine';

export const EXCHANGE_ENGINE = 'EXCHANGE_ENGINE';
export const EXECUTION_ENGINE = 'EXECUTION_ENGINE';
export const PORTFOLIO_ENGINE = 'PORTFOLIO_ENGINE';

@Global()
@Module({
  providers: [
    {
      // ExchangeEngine is a singleton; the Master Key load happens once at
      // module init (fail-fast on missing ENCRYPTION_KEY env).
      provide: EXCHANGE_ENGINE,
      useFactory: () => {
        const crypto = new ExchangeEngineCrypto();
        return new ExchangeEngine(crypto);
      },
    },
    {
      provide: EXECUTION_ENGINE,
      inject: [EXCHANGE_ENGINE],
      useFactory: (exchangeEngine: ExchangeEngine) =>
        new ExecutionEnginePkg(exchangeEngine),
    },
    {
      provide: PORTFOLIO_ENGINE,
      inject: [EXCHANGE_ENGINE],
      useFactory: (exchangeEngine: ExchangeEngine) =>
        new PortfolioEnginePkg(exchangeEngine),
    },
  ],
  exports: [EXCHANGE_ENGINE, EXECUTION_ENGINE, PORTFOLIO_ENGINE],
})
export class EnginesModule {}
