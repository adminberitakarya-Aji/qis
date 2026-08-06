# Qis

**AI-Assisted Grid Trading Platform**

Qis helps traders build intelligent grid strategies using Artificial Intelligence — without giving full control to AI.

Unlike traditional trading bots, Qis does not allow AI to trade autonomously. AI acts as a **Strategy Planner**, while the trader remains in full control of every trading decision.

---

## Core Philosophy

```
AI analyzes.
AI recommends.
Trader decides.
System executes.
```

This principle must never change.

- **AI is Planner** — AI analyzes market conditions and generates the best possible Strategy Blueprint
- **User is in Control** — Capital, allocation, sections, and risk are always owned by the trader
- **Deterministic Execution** — After approval, the system executes the Blueprint exactly as defined
- **Transparent & Explainable** — Every AI recommendation includes reasoning and confidence score. No black-box decisions

---

## Key Features

### AI-Assisted, Not Autonomous

AI continuously analyzes the market and recommends the five most promising trading pairs — each with confidence score and reasoning. The trader decides which pair to trade.

### Strategy Blueprint

AI generates a complete Strategy Blueprint based on trader input:

- Trading Pair
- Capital Allocation
- Section Count (1–3)
- Grid Count
- Grid Distance
- Section Gap
- Take Profit (per Section)
- Confidence Score
- AI Reasoning

The Blueprint is **immutable once approved** — the Execution Engine follows it exactly.

### Grid with Instant Execution

Unlike conventional grid trading that places limit orders in the order book, Qis uses **market orders**:

- No order queue
- No risk of orders failing to fill when price moves away
- When price touches or crosses a grid level, execution is **instant**
- Take Profit is calculated from the **actual executed price** (not the grid level)

### Strategy Simulation

Every Blueprint must be simulated before execution. Simulation estimates:

- Capital Usage
- Order Count
- Average Entry
- Estimated Fees
- Estimated Net Profit
- Estimated Drawdown

### Multi-Section Adaptive Grid

Capital is divided into multiple Sections, each with its own:

- Grid Count
- Grid Distance
- Section Gap
- min_net_profit_percent

Deeper Sections carry higher risk, so they require higher profit targets.

### Spot Trading Only

Supported exchanges:

- Binance Spot
- Bybit Spot

Futures, Margin, Leverage, and Options are **not supported**.

---

## Architecture

Qis is built using an **Engine-Based Architecture** — each Engine has exactly one responsibility.

```
User
  │
  ▼
AI Build Strategy
  │
  ▼
Strategy Engine → AI Engine → Market Engine
  │
  ▼
Strategy Blueprint
  │
  ▼
Simulation
  │
  ▼
User Approval
  │
  ▼
Grid Engine → Execution Engine → Exchange Engine
  │
  ▼
Binance / Bybit
```

### Engines

| Engine | Responsibility |
|--------|---------------|
| Strategy Engine | Build, validate, and simulate Blueprints |
| AI Engine | Market analysis, pair recommendation, confidence score |
| Market Engine | Price, candlestick, volume, order book |
| Grid Engine | Generate grid, grid distance, section gap |
| Execution Engine | Instant market buy/sell, order monitoring |
| Exchange Engine | Exchange API, WebSocket, authentication |
| Portfolio Engine | Balance, assets, positions, PnL |
| Analytics Engine | Statistics, performance, reports |
| Notification Engine | Telegram, email, Discord, webhook |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm + Turborepo |
| Language | TypeScript (full-stack) |
| Frontend | Next.js 14+ (App Router) |
| API | NestJS |
| Worker | Node.js + BullMQ |
| AI Service | Python FastAPI (proposed) |
| Database | PostgreSQL + Prisma |
| Cache / Queue | Redis |
| Realtime | WebSocket (`ws`) |

---

## Project Structure

```
qis/
│
├── README.md                    # Project Overview
├── CLAUDE.md                    # Engineering Constitution
├── LOVABLE.md                   # UI/UX Constitution
│
├── docs/
│   ├── PRODUCT.md               # Product Vision & Features
│   ├── ARCHITECTURE.md          # System Architecture
│   ├── BUSINESS_RULES.md        # Trading Business Rules
│   ├── BUSINESS_RULES_ADDENDUM.md # Safety & Reliability Rules
│   ├── API_CONTRACT.md          # Backend ↔ Frontend Contract
│   └── TECH_STACK.md            # Technology Stack
│
├── apps/
│   ├── web/                     # Frontend (Next.js)
│   ├── api/                     # Backend API (NestJS)
│   ├── worker/                  # Background Jobs (BullMQ)
│   └── ai-service/              # AI Service (Python/FastAPI)
│
├── packages/
│   ├── core/                    # Domain Models & Core Business Logic
│   ├── engines/                 # Strategy, AI, Market, Grid, Execution, etc.
│   ├── providers/               # AI (OpenAI/Anthropic/Gemini), Exchange (Binance/Bybit)
│   └── shared/                  # Config, Constants, Types, Utils, Validation
│
├── infrastructure/
│   ├── database/
│   ├── deployment/
│   ├── docker/
│   ├── monitoring/
│   └── scripts/
│
└── .github/
    └── workflows/
```

---

## Documentation

| Document | Purpose |
|----------|---------|
| [PRODUCT.md](docs/PRODUCT.md) | Product vision, features, and target users |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Engine-Based Architecture and responsibilities |
| [BUSINESS_RULES.md](docs/BUSINESS_RULES.md) | Official trading business rules |
| [BUSINESS_RULES_ADDENDUM.md](docs/BUSINESS_RULES_ADDENDUM.md) | Safety, security, and reliability rules |
| [API_CONTRACT.md](docs/API_CONTRACT.md) | Backend ↔ Frontend communication contract |
| [TECH_STACK.md](docs/TECH_STACK.md) | Technology decisions and reasoning |
| [CLAUDE.md](CLAUDE.md) | Engineering Constitution |
| [LOVABLE.md](LOVABLE.md) | UI/UX Constitution |

---

## Development Status

### MVP

- [ ] Initialize Monorepo
- [ ] Authentication
- [ ] Database
- [ ] Connect Binance
- [ ] Connect Bybit
- [ ] Market Engine
- [ ] AI Pair Recommendation
- [ ] AI Build Strategy
- [ ] Strategy Blueprint
- [ ] Simulation
- [ ] Grid Engine
- [ ] Execution Engine
- [ ] Portfolio
- [ ] Analytics
- [ ] Notification

### Version 1.1

- [ ] Marketplace
- [ ] Backtest
- [ ] Risk Engine

### Version 2.0

- [ ] Copy Trading
- [ ] Mobile App
- [ ] Multi Account

---

## Disclaimer

**Qis is not an AI Trading Bot.**

Qis is an AI-Assisted Grid Trading Platform.

AI creates Strategy. User approves Strategy. System executes Strategy.

**Cryptocurrency trading involves substantial risk.** Past performance or simulated results do not guarantee future profits. Always trade responsibly and never invest more than you can afford to lose.