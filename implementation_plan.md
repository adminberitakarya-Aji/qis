# Implementation Plan - Qis MVP Engines & Backend API

This plan outlines the next phase of development for **Qis (AI-Assisted Grid Trading Platform)**, advancing the MVP according to `CLAUDE.md`, `BUSINESS_RULES.md`, `BUSINESS_RULES_ADDENDUM.md`, and `API_CONTRACT.md`.

## User Review Required

> [!IMPORTANT]
> - **Exchange Integration**: We will use `ccxt` as the core unified exchange engine provider for Binance and Bybit spot trading, ensuring secret isolation (Secrets are ONLY decrypted inside Exchange Engine).
> - **AI Engine Provider**: We will implement an AI Engine that integrates with LLM APIs (OpenAI / Gemini / Anthropic) with an intelligent market-metric heuristic fallback so that pair recommendations and strategy generation work seamlessly even without external LLM keys.
> - **Strict Business Rules**: All Strategy Blueprints will enforce immutable section bounds, Section Gaps, per-section `min_net_profit_percent`, Capital Protection Floors, maximum gap movement limits, and the 15-minute Validity Window.

## Proposed Changes

### Monorepo Setup & Workspace Configuration

#### [MODIFY] [pnpm-workspace.yaml](file:///d:/qis/pnpm-workspace.yaml)
- Add `"packages/engines/*"` and `"packages/providers/*"` to workspace globs.

---

### Phase 1: Exchange Provider & Exchange Engine (`@qis/exchange-engine`)

#### [NEW] [package.json](file:///d:/qis/packages/engines/exchange-engine/package.json)
#### [NEW] [index.ts](file:///d:/qis/packages/engines/exchange-engine/src/index.ts)
- Implement `ExchangeEngineService` for API key validation, account balance fetching, pair discovery, and order routing via CCXT for Binance and Bybit spot markets.
- Guarantee **Secret Ownership Rule**: Secrets are decrypted ONLY inside the Exchange Engine.

#### [NEW] [exchange.controller.ts](file:///d:/qis/apps/api/src/exchange/exchange.controller.ts)
#### [NEW] [exchange.module.ts](file:///d:/qis/apps/api/src/exchange/exchange.module.ts)
- Endpoints: `POST /api/v1/exchange/connect`, `POST /api/v1/exchange/test`, `GET /api/v1/exchange/balance`, `GET /api/v1/exchange/pairs`.

---

### Phase 2: Market Engine (`@qis/market-engine`)

#### [NEW] [package.json](file:///d:/qis/packages/engines/market-engine/package.json)
#### [NEW] [index.ts](file:///d:/qis/packages/engines/market-engine/src/index.ts)
- Implement `MarketEngineService` to fetch & standardize 24h tickers, orderbook depth, market stats, and OHLCV candlestick data across exchanges.

#### [NEW] [market.controller.ts](file:///d:/qis/apps/api/src/market/market.controller.ts)
#### [NEW] [market.module.ts](file:///d:/qis/apps/api/src/market/market.module.ts)
- Endpoints: `GET /api/v1/market/list`, `GET /api/v1/market/ticker`, `GET /api/v1/market/candlestick`, `GET /api/v1/market/orderbook`, `GET /api/v1/market/stats`.

---

### Phase 3: AI Engine (`@qis/ai-engine`) & Pair Recommendation

#### [NEW] [package.json](file:///d:/qis/packages/engines/ai-engine/package.json)
#### [NEW] [index.ts](file:///d:/qis/packages/engines/ai-engine/src/index.ts)
- Implement `AiEngineService`: analyze pair volatility, volume, liquidity, generate Top 5 Pair Recommendations with confidence scores and explainable reasoning.

#### [NEW] [ai.controller.ts](file:///d:/qis/apps/api/src/ai/ai.controller.ts)
#### [NEW] [ai.module.ts](file:///d:/qis/apps/api/src/ai/ai.module.ts)
- Endpoints: `GET /api/v1/ai/pairs/recommendation`, `POST /api/v1/ai/analyze`.

---

### Phase 4: Grid Engine (`@qis/grid-engine`), Strategy Engine (`@qis/strategy-engine`) & Simulation

#### [NEW] [package.json](file:///d:/qis/packages/engines/grid-engine/package.json)
#### [NEW] [index.ts](file:///d:/qis/packages/engines/grid-engine/src/index.ts)
- Implement grid builder: section level calculator, section gap spacing, grid distance spacing, grid level prices, Take Profit target calculation (`calculateTpPrice`).

#### [NEW] [package.json](file:///d:/qis/packages/engines/strategy-engine/package.json)
#### [NEW] [index.ts](file:///d:/qis/packages/engines/strategy-engine/src/index.ts)
- Implement Strategy Blueprint Generator:
  - Takes user inputs (pair, capital, section count, capital allocation).
  - Uses AI recommendation for grid count, grid distance, section gap, per-section `min_net_profit_percent`.
  - Calculates capital protection floor and max gap capital limit.
  - Sets 15-minute expiry timestamp (`expiresAt`).
- Implement Simulation Engine:
  - Runs strategy against OHLCV candles to estimate capital usage, order count, fees, net profit %, and drawdown %.

#### [NEW] [strategy.controller.ts](file:///d:/qis/apps/api/src/strategy/strategy.controller.ts)
#### [NEW] [strategy.module.ts](file:///d:/qis/apps/api/src/strategy/strategy.module.ts)
#### [NEW] [simulation.controller.ts](file:///d:/qis/apps/api/src/simulation/simulation.controller.ts)
- Endpoints: `POST /api/v1/strategy/build`, `GET /api/v1/strategy/blueprint/:id`, `POST /api/v1/simulation/run`.

---

### Phase 5: Verification & Task Status Update

#### [MODIFY] [TASK.md](file:///d:/qis/TASK.md)
- Update checked status for completed engines and API modules.

---

## Verification Plan

### Automated Verification
- Run `pnpm build` across all workspace packages and apps to verify TypeScript compilation and Turbo orchestration.
- Run `pnpm typecheck` to confirm zero type errors.

### Manual Verification
- Test NestJS endpoints using curl or integration test scripts.
- Verify standard response format `{ success: true, message: ..., data: ... }` for all endpoints as specified in `API_CONTRACT.md`.
