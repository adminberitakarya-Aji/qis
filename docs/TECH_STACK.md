# TECH_STACK.md

# Qis Technology Stack

Version: 1.1
Status: Final

---

# Overview

This document defines the technology stack for Qis.

Every choice here must support the Engine-Based Architecture defined in ARCHITECTURE.md.

Provider Independence still applies. Choosing a technology here does not permit any Engine to depend directly on it outside its designated boundary (e.g. only Exchange Engine talks to exchange SDKs, only AI Engine talks to AI provider SDKs).

---

# Monorepo

**Decision: pnpm + Turborepo**

Reasoning:

- Fast installs, efficient disk usage via content-addressable store
- Turborepo remote caching speeds up CI and local builds
- Native workspace support fits the `apps/` + `packages/` structure in ARCHITECTURE.md
- Already proven across other active projects (PAO Companion, Klip-AI), reducing tooling overhead for a solo developer

---

# Language

**Decision: TypeScript, full-stack — except AI Service (see below)**

Reasoning:

- Type safety across Engine boundaries reduces contract drift between Strategy Engine, Grid Engine, and Execution Engine
- One language across `web`, `api`, and `worker` keeps context-switching low for a solo developer
- Shared types (Blueprint, GridSection, MarketData) can live in `packages/shared/types` and be imported everywhere except AI Service

---

# Web (Frontend)

**Decision: Next.js 14+, App Router**

Reasoning:

- SSR support for dashboard performance
- Mature React ecosystem for data visualization (charts, grid views)
- Server Components suit read-heavy views (Portfolio, Analytics, Market)

Constraint:

Per API_CONTRACT.md, the Frontend must never calculate Grid, Section Gap, Profit, Fees, or Blueprints. This constraint applies to Server Components and Server Actions equally — they may fetch and render, but must not compute business logic. All computation happens in `apps/api`.

---

# API

**Decision: NestJS**

Reasoning:

- Modular architecture (Modules, Providers, Guards) maps directly onto Engine-Based Architecture — each Engine can be represented as its own Nest module with a clear public interface
- Built-in DI container makes Provider Independence (AI providers, Exchange providers) easier to enforce and mock in tests
- Already the proven pattern from PAO Companion (DDD domain layers, strict-mode DTOs) — directly reusable knowledge and boilerplate

Fastify was considered and rejected: faster raw throughput, but Qis's bottleneck is exchange API rate limits and AI provider latency, not HTTP framework overhead. NestJS's structure benefit outweighs Fastify's speed benefit here.

---

# Worker

**Decision: Node.js + WebSocket (`ws`) — `apps/worker`**

Reasoning:

- Monitors live market prices directly via Binance Public WebSocket streams (`wss://stream.binance.com:9443/ws/<symbol>@miniTicker`)
- Detects grid price level crossings in real-time with sub-second latency and zero API key requirement
- Triggers instant Market Orders via NestJS API (`POST /api/v1/execution/trigger-order`) protected by internal `x-worker-secret` authentication header
- Automatically reconnects on disconnect with exponential backoff and periodic heartbeat

Constraint:

Every job and trigger must be idempotent. A duplicate price tick or trigger request must never create duplicate grid orders or corrupt state. This connects directly to the Idempotency Rules in BUSINESS_RULES_ADDENDUM.md.

---

# AI Service

**Decision: Python 3.11+, FastAPI (`apps/ai-service`)**

This is the one layer where full TypeScript consistency is intentionally broken.

Reasoning:

- AI Engine's responsibilities (Market Analysis, Technical Feature Extraction, Confidence Score) benefit from Python's robust data ecosystem (`pandas`, `numpy`, `ccxt`)
- Feature Extraction calculates RSI(14), Bollinger Band Width (20,2), ATR % (14), 24h Volatility, and Sideways score across 20 liquid spot candidate pairs (BTC, ETH, SOL, BNB, XRP, ADA, AVAX, NEAR, etc.)
- Explainable AI Engine (`reasoning.py`) synthesizes technical indicators into human-readable trader reasoning texts and risk-adjusted per-section parameters
- `@qis/ai-engine` (TypeScript) acts as an HTTP client connecting to `http://localhost:8000` (`POST /analyze/top-pairs` & `POST /analyze/strategy`) with local heuristic fallback if Python service is offline

Isolation requirement: the AI Service is reachable only through `@qis/ai-engine` REST contract. No other Engine may call the Python AI Service directly.

---

# Database

**Decision: PostgreSQL + Prisma**

Reasoning:

- Relational model fits Blueprint → Section → Grid Order hierarchy with clear foreign keys
- Transaction support required for capital allocation and order state changes
- Prisma already proven across PAO Companion, Klip-AI, and Suro & Buya — consistent `db push` workflow, no new tooling to learn

Drizzle was considered and rejected: technically comparable, but no strong reason to leave a tool already deeply familiar from other active projects.

---

# Cache / Queue

**Decision: Redis**

Reasoning:

- Backs BullMQ for Worker job queueing
- Required for rate limiting against Binance/Bybit APIs — grid strategies with multiple Sections generate high request volume, and exchange rate limits are strict
- Caches Market Engine data (candlestick, ticker) to reduce redundant exchange calls

---

# Realtime

**Decision: WebSocket, using `ws` (not Socket.io)**

Reasoning:

- Order status, portfolio balance, and Grid status changes need push updates per the Real-Time Data Rules in BUSINESS_RULES_ADDENDUM.md
- `ws` is lighter weight than Socket.io; Socket.io's main value-add (automatic polling fallback, room abstraction) is not needed for a single web frontend with controlled reconnect/reconciliation logic
- Reconnection and state reconciliation logic can be implemented explicitly per the addendum's requirement to reconcile state after reconnect, rather than relying on a library's default behavior

Ownership: Exchange Engine owns the upstream WebSocket connection to Binance/Bybit. API layer owns the downstream WebSocket connection to the Frontend. No Engine other than Exchange Engine connects to an exchange WebSocket directly.

---

# Secrets & Encryption

**Decision: Application-level envelope encryption, `node:crypto` (AES-256-GCM)**

Per Secret Ownership Rules in BUSINESS_RULES_ADDENDUM.md, Exchange API Secrets must be encrypted at rest and decryptable only by Exchange Engine.

Reasoning:

- Infrastructure is already multi-provider (Railway/Render/GCP Cloud Run, consistent with Suro & Buya's deployment pattern). A managed KMS (AWS/GCP) would lock the decrypt path to one cloud provider, contradicting that flexibility.
- At MVP stage with a single developer, managed KMS's main advantages — automated key rotation and access audit trails — are not yet worth the setup cost (IAM policy, service accounts, network access from Worker to the KMS endpoint).
- The decrypt path is fully isolated behind Exchange Engine's internal interface per Secret Ownership Rules, so the underlying mechanism can be swapped for a managed KMS later without changing any other Engine's contract.

## Implementation Details

**Algorithm:** AES-256-GCM. Authenticated encryption — a tampered ciphertext fails integrity verification instead of silently decrypting to garbage.

**Pattern:** Envelope encryption.

- One Master Key (KEK — Key Encryption Key) stored as an environment variable in the hosting platform's encrypted secret store (Railway/Render both support this natively)
- The Master Key must never appear in source code, git history, or logs
- Each Exchange API Secret is encrypted individually using the Master Key; the resulting ciphertext, IV (nonce), and auth tag are stored together as a single blob per record

**Key Versioning:** Every encrypted record stores a `keyVersion` field alongside the ciphertext blob, starting at version 1. This is required from day one, even with only one key in use, so that a future Master Key rotation is a data migration (re-encrypt records to a new version, incrementally) rather than a schema change.

## Operational Requirements

- The application must fail to start if the Master Key environment variable is missing or empty. No fallback to a hardcoded or empty key is permitted under any circumstance.
- The Master Key must differ between environments (development, staging, production).
- The Master Key must be backed up separately from the database backup. If both are stored in the same location, a single breach compromises the encryption entirely.

This decision affects the Prisma schema: encrypted secret columns must store ciphertext, IV, auth tag, and keyVersion — never plaintext, even temporarily.

---

# Final Principle

Every technology choice must serve the Engine-Based Architecture, not the other way around.

If a tool makes it easier to violate Single Responsibility or Provider Independence, it is the wrong tool — regardless of how popular or convenient it is.
