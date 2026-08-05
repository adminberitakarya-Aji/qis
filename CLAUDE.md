# CLAUDE.md

# Qis Engineering Constitution

Version: 1.0

---

# Introduction

Qis is an AI-Assisted Grid Trading Platform.

The purpose of AI in this platform is NOT to trade automatically.

The AI exists to analyze market conditions and generate the best possible Strategy Blueprint.

Trading execution is always deterministic and follows the approved Strategy Blueprint.

User always has the final decision.

---

# Core Philosophy

## AI is Planner

AI is responsible for:

- Market Analysis
- Pair Recommendation
- Strategy Generation
- Grid Optimization
- Section Gap Optimization
- AI Reasoning
- Confidence Score

AI is NOT responsible for:

- Executing trades
- Changing user capital
- Changing user allocation
- Opening positions automatically
- Closing positions automatically

---

## Blueprint First

Everything starts with Strategy Blueprint.

User Input

↓

AI Build Strategy

↓

Strategy Blueprint

↓

Simulation

↓

User Approval

↓

Execution

No Engine is allowed to bypass the Strategy Blueprint.

---

# Product Principles

The platform must always prioritize:

1. Simplicity
2. Transparency
3. Explainability
4. User Control
5. Predictable Behavior

The user should always understand why AI generated a strategy.

---

# Official Project Structure

Qis/
│
├── README.md                    # Project Overview (ditulis setelah MVP)
├── CLAUDE.md                    # Engineering Constitution
├── LOVABLE.md                   # UI/UX Constitution
│
├── docs/
│   ├── PRODUCT.md               # Product Vision & Features
│   ├── ARCHITECTURE.md          # System Architecture
│   ├── BUSINESS_RULES.md        # Trading Business Rules
│   └── API_CONTRACT.md          # Backend ↔ Frontend Contract
│
├── apps/
│   ├── web/                     # Frontend (Next.js)
│   ├── api/                     # Backend API
│   ├── worker/                  # Background Jobs
│   └── ai-service/              # AI Orchestration Service
│
├── packages/
│   │
│   ├── core/                    # Domain Models & Core Business Logic
│   │
│   ├── engines/
│   │   ├── strategy-engine/     # Strategy Blueprint
│   │   ├── ai-engine/           # AI Analysis & Recommendation
│   │   ├── market-engine/       # Market Data Collector
│   │   ├── grid-engine/         # Grid Builder
│   │   ├── execution-engine/    # Order Execution
│   │   ├── portfolio-engine/    # Portfolio Management
│   │   ├── analytics-engine/    # Statistics & Reporting
│   │   ├── exchange-engine/     # Exchange Communication
│   │   └── notification-engine/ # Telegram / Email / Webhook
│   │
│   ├── providers/
│   │   ├── ai/
│   │   │   ├── openai/
│   │   │   ├── anthropic/
│   │   │   └── gemini/
│   │   │
│   │   └── exchange/
│   │       ├── binance/
│   │       └── bybit/
│   │
│   └── shared/
│       ├── config/
│       ├── constants/
│       ├── errors/
│       ├── logger/
│       ├── types/
│       ├── utils/
│       └── validation/
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

---

# Architecture Principles

The project follows Engine-Based Architecture.

Each Engine has one responsibility.

Never mix responsibilities between engines.

---

Strategy Engine

Responsible for:

- Building Blueprint
- Strategy Validation
- Strategy Simulation

---

AI Engine

Responsible for:

- Market Analysis
- Pair Ranking
- Grid Recommendation
- Section Gap Recommendation
- AI Reasoning

Never execute trades.

---

Market Engine

Responsible for:

- Candlestick Data
- Orderbook
- Volume
- Market Statistics

Only provide market data.

---

Grid Engine

Responsible for:

- Generate Grid
- Generate Orders
- Calculate Grid Distance
- Calculate Section Gap

Never analyze market.

---

Execution Engine

Responsible for:

- Buy
- Sell
- Retry
- Order Monitoring

Never make strategy decisions.

---

Exchange Engine

Responsible for:

- Exchange API
- WebSocket
- Authentication

No business logic.

---

Portfolio Engine

Responsible for:

- Balance
- Asset
- Position
- Profit

---

Analytics Engine

Responsible for:

- Statistics
- Reports
- Performance

---

Notification Engine

Responsible for:

- Telegram
- Email
- Discord
- Webhook

---

# Business Principles

Always follow BUSINESS_RULES.md.

Never invent business rules.

Never assume trading logic.

If business rules are missing,

ask for clarification.

---

# Strategy Blueprint

Blueprint is the heart of the system.

Blueprint may contain:

- Pair
- Capital
- Section Count
- Allocation
- Grid Count
- Grid Distance
- Section Gap
- Take Profit
- Confidence
- AI Reasoning

Blueprint must be deterministic.

---

# AI Behavior

AI should always explain:

Why this pair?

Why this grid?

Why this section?

Why this gap?

Why this TP?

Never produce black-box decisions.

---

# User First

User owns:

Capital

Section

Allocation

Risk Preference

Exchange

AI must never modify user inputs.

AI only provides recommendations.

---

# Engineering Rules

Keep code:

Simple

Readable

Modular

Reusable

Maintainable

Avoid unnecessary abstractions.

Avoid premature optimization.

Avoid over-engineering.

---

# Folder Responsibility

Every folder must have a single purpose.

Do not duplicate business logic.

Shared logic belongs in shared modules.

---

# Naming Convention

Use meaningful names.

Good

StrategyBlueprint

GridSection

MarketAnalysis

PairRecommendation

ExecutionResult

Bad

Manager1

Helper

Utils2

TempData

---

# Code Principles

Prefer composition over inheritance.

Prefer explicit code over magic.

Prefer readability over cleverness.

Write code for humans first.

---

# Error Handling

Never silently ignore errors.

Always return meaningful messages.

Log unexpected errors.

---

# Logging

Log important events only.

Do not spam logs.

Every execution should be traceable.

---

# AI Response

AI outputs should always include:

Recommendation

Confidence

Reasoning

Never output recommendation without explanation.

---

# Simulation

Before execution,

Strategy must be simulated.

Simulation should estimate:

Capital Usage

Order Count

Average Entry

Estimated Fee

Estimated Profit

Maximum Drawdown

Simulation is estimation only.

Never guarantee profit.

---

# Development Workflow

Feature

↓

Design

↓

Implementation

↓

Review

↓

Test

↓

Merge

Never skip review.

---

# Pull Request Rules

Every Pull Request should:

Have one responsibility.

Be small.

Be reviewable.

Be testable.

---

# Future Development

Future features should extend existing Engines.

Do not modify architecture without strong justification.

Preserve backward compatibility whenever possible.

---

# Final Principle

Qis is NOT an AI Trading Bot.

Qis is an AI-Assisted Grid Trading Platform.

AI creates Strategy.

User approves Strategy.

System executes Strategy.

This principle must never change.