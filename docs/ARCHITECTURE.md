# ARCHITECTURE.md

# Qis System Architecture

Version: 1.0

---

# Overview

Qis is built using an Engine-Based Architecture.

Each Engine has one responsibility.

Every Engine communicates through clearly defined interfaces.

Business logic is isolated from infrastructure.

The architecture is designed to be:

- Modular
- Maintainable
- Testable
- Scalable
- Provider Independent

---

# Architecture Principles

## Single Responsibility

Each Engine has exactly one responsibility.

Never combine multiple business domains inside one Engine.

---

## Blueprint First

The Strategy Blueprint is the center of the system.

Every trading execution originates from an approved Blueprint.

---

## AI is Planner

AI analyzes.

AI recommends.

AI generates Blueprint.

AI never executes trades.

---

## Deterministic Execution

Execution Engine always follows the approved Blueprint.

Execution never depends on AI after approval.

---

## Provider Independence

Business logic must never depend directly on:

- Binance
- Bybit
- OpenAI
- Anthropic
- Gemini

Provider implementations belong only inside Providers.

---

# High-Level Architecture

```
                User
                  │
                  ▼
        AI Build Strategy
                  │
                  ▼
          Strategy Engine
                  │
                  ▼
             AI Engine
                  │
                  ▼
          Market Engine
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
           Grid Engine
                  │
                  ▼
       Execution Engine
                  │
                  ▼
        Exchange Engine
                  │
                  ▼
        Binance / Bybit
```

---

# Engine Responsibilities

## Strategy Engine

Responsible for:

- Build Strategy Blueprint
- Validate Blueprint
- Strategy Planning
- Strategy Simulation

Input:

- User Parameters
- AI Recommendation

Output:

- Strategy Blueprint

---

## AI Engine

Responsible for:

- Market Analysis
- Pair Recommendation
- Grid Recommendation
- Section Gap Recommendation
- Confidence Score
- AI Reasoning

AI never executes trades.

---

## Market Engine

Responsible for collecting market information.

Examples:

- Price
- Candlestick
- Volume
- Order Book
- Market Statistics

This Engine never creates strategies.

---

## Grid Engine

Responsible for:

- Generate Grid
- Generate Grid Orders
- Calculate Grid Distance
- Calculate Section Gap

Grid Engine follows the approved Blueprint.

---

## Execution Engine

Responsible for:

- Buy
- Sell
- Retry
- Order Monitoring

Execution Engine never changes strategy.

---

## Exchange Engine

Responsible for:

- REST API
- WebSocket
- Authentication
- Order Submission

Contains no business logic.

---

## Portfolio Engine

Responsible for:

- Balance
- Assets
- Positions
- PnL

---

## Analytics Engine

Responsible for:

- Statistics
- Performance
- Reports

---

## Notification Engine

Responsible for:

- Telegram
- Email
- Discord
- Webhook

---

# Engine Flow

```
Strategy Engine
        │
        ▼
AI Engine
        │
        ▼
Market Engine
        │
        ▼
Blueprint
        │
        ▼
Simulation
        │
        ▼
Approval
        │
        ▼
Grid Engine
        │
        ▼
Execution Engine
        │
        ▼
Exchange Engine
        │
        ▼
Portfolio Engine
        │
        ▼
Analytics Engine
        │
        ▼
Notification Engine
```

---

# Project Structure

```
apps/
│
├── web/
├── api/
├── worker/
└── ai-service/

packages/
│
├── core/
├── engines/
├── providers/
└── shared/
```

---

# Providers

Providers isolate third-party services.

Examples

AI Providers

- OpenAI
- Anthropic
- Gemini

Exchange Providers

- Binance
- Bybit

Business logic must never depend on provider implementations.

---

# Shared Package

Shared contains reusable components.

Examples

- Config
- Logger
- Types
- Constants
- Validation
- Utilities

Business logic does not belong here.

---

# Data Flow

```
User Input

↓

Strategy Engine

↓

AI Engine

↓

Market Engine

↓

Blueprint

↓

Simulation

↓

Approval

↓

Grid Generation

↓

Execution

↓

Exchange

↓

Portfolio

↓

Analytics

↓

Notification
```

---

# Dependency Rules

Allowed

Strategy Engine

↓

AI Engine

↓

Market Engine

↓

Grid Engine

↓

Execution Engine

↓

Exchange Engine

Not Allowed

Exchange Engine

↓

Strategy Engine

Execution Engine

↓

AI Engine

Notification Engine

↓

Execution Engine

Dependencies must always flow in one direction.

---

# Future Expansion

New features should extend the architecture.

Do not modify existing Engine responsibilities.

Examples

Future Engines

- Backtest Engine
- Marketplace Engine
- Risk Engine

New Engines should integrate without breaking existing architecture.

---

# Final Principle

Qis is built around one central concept.

Strategy Blueprint.

Every Engine exists to:

Create,

Validate,

Execute,

or

Observe

the Strategy Blueprint.

The Blueprint is the single source of truth during every trading session.