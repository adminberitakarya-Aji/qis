# Qis — World-Class Implementation Plan
**AI-Assisted Grid Trading Platform**  
**Version:** 2.0  
**Date:** 2026-08-07  
**Prepared by:** Senior AI Engineer — AI Trading & Full-Stack Architecture  

---

## Executive Summary

Qis has achieved **MVP completeness** with all 15 critical tasks resolved (per AUDIT_REPORT.md). The architectural foundation is **solid (95/100)** with clean Engine-Based Architecture, robust security (AES-256-GCM envelope encryption, secret ownership rules), comprehensive documentation, and 63 unit tests.

**This plan elevates Qis from "MVP Complete" to "World-Class Production-Grade Platform"** — capable of handling institutional-scale traffic, multi-region deployment, advanced AI/ML capabilities, regulatory compliance, and seamless developer experience.

---

## Current State Assessment

### ✅ Completed (MVP)
| Component | Status |
|-----------|--------|
| Monorepo (pnpm + Turborepo) | ✅ |
| 9 Engines (Strategy, AI, Market, Grid, Execution, Exchange, Portfolio, Analytics, Notification) | ✅ |
| Exchange Providers (Binance, Bybit) | ✅ |
| AI Providers (OpenAI, Anthropic, Gemini) | ✅ |
| Real-time WebSocket (Worker → API → Frontend) | ✅ |
| Capital Protection (Floor, Gaps, Drawdown Alerts) | ✅ |
| Idempotency (API + Exchange level) | ✅ |
| User Authorization (Blueprint ownership) | ✅ |
| Unit Tests (63 tests, Vitest) | ✅ |
| Rate Limiting (@nestjs/throttler) | ✅ |
| Structured Logging (@qis/logger) | ✅ |
| Graceful Shutdown (Worker) | ✅ |
| Database Indexes & JSONB | ✅ |
| Auth UI (Login/Register/Guard/Refresh) | ✅ |

### ⚠️ Gaps for World-Class
| Category | Missing |
|----------|---------|
| **Observability** | No distributed tracing, metrics dashboard, alerting |
| **CI/CD** | No automated pipelines, staging/prod environments |
| **Resilience** | No circuit breakers, bulkheads, chaos engineering |
| **Advanced AI** | No ML model versioning, A/B testing, feature store |
| **Backtest Engine** | Not implemented (v1.1) |
| **Risk Engine** | Not implemented (v1.1) |
| **Marketplace** | Not implemented (v1.1) |
| **Multi-region/HA** | Single-region deployment |
| **Compliance** | No audit trail for trading actions, KYC/AML hooks |
| **Performance** | No load testing, query optimization, caching strategy |
| **Mobile** | Not implemented (v2.0) |
| **Copy Trading** | Not implemented (v2.0) |

---

## Phase 1: Production Hardening (Weeks 1-4)
*Goal: Zero-downtime deployment, full observability, enterprise-grade reliability*

### 1.1 Observability Stack (Week 1)
- [ ] **Distributed Tracing**: OpenTelemetry + Jaeger/Tempo
  - Instrument all 9 engines with trace context propagation
  - Trace: HTTP requests, WebSocket messages, DB queries, external API calls
  - Correlation IDs across Worker → API → Exchange Engine → Exchange
- [ ] **Metrics**: Prometheus + Grafana
  - RED metrics (Rate, Errors, Duration) per endpoint
  - Business metrics: active strategies, orders/sec, fill rate, PnL, latency p50/p95/p99
  - Engine-specific: AI inference latency, grid calc time, simulation time
  - System: CPU, memory, Redis, PostgreSQL, WebSocket connections
- [ ] **Logging**: Loki + Grafana (structured JSON already implemented)
  - Centralized log aggregation with label-based queries
  - Log-based metrics (error rates, warning trends)
- [ ] **Alerting**: Alertmanager + PagerDuty/Slack/Telegram
  - Critical: Worker down, API 5xx > 1%, DB connection pool exhaustion
  - Warning: High latency, WebSocket reconnect storms, rate limit near threshold
  - Business: Strategy stopped unexpectedly, capital protection triggered

### 1.2 CI/CD Pipeline (Week 2)
- [ ] **GitHub Actions Workflow**
  - `ci.yml`: lint → typecheck → test → build (all packages)
  - `cd-staging.yml`: deploy to staging on merge to `main`
  - `cd-production.yml`: manual approval → blue/green deploy to production
- [ ] **Environments**: Development → Staging → Production
  - Separate Kubernetes namespaces / Railway projects / Render services
  - Environment-specific secrets (Master Key, API keys, DB URLs)
  - Database migration strategy (Prisma Migrate with rollback)
- [ ] **Automated Testing in Pipeline**
  - Unit tests (63 existing)
  - Integration tests (new: API contract, Engine interactions)
  - E2E tests (new: Playwright for critical user flows)
  - Load tests (new: k6 scenarios for grid execution under load)
- [ ] **Security Scanning**
  - `npm audit` / `pnpm audit` in CI
  - SAST (CodeQL) for TypeScript/Python
  - Dependency review for PRs
  - Container scan (Trivy) for Docker images

### 1.3 Resilience Patterns (Week 3)
- [ ] **Circuit Breaker** (via `@nestjs/terminus` or custom)
  - Exchange Engine: wrap all external exchange calls
  - AI Engine: wrap Python service + LLM provider calls
  - Configurable: failure threshold, timeout, half-open probes
- [ ] **Bulkhead Pattern**
  - Separate connection pools per exchange (Binance, Bybit)
  - Isolate Worker price streams from API request handling
  - Dedicated Redis connections for rate limiting vs caching vs BullMQ
- [ ] **Retry with Exponential Backoff + Jitter**
  - Standardize across all external calls (Exchange, AI, DB)
  - Idempotency-aware retries (only for safe operations)
- [ ] **Graceful Degradation**
  - AI Service down → fallback to heuristic recommendations (already implemented)
  - WebSocket down → REST polling fallback (per BUSINESS_RULES_ADDENDUM)
  - Exchange API down → queue orders locally, replay on recovery

### 1.4 Database & Performance (Week 4)
- [ ] **Connection Pooling**: PgBouncer (transaction mode)
  - Configure pool size per service (API: 20, Worker: 5, AI: 2)
- [ ] **Query Optimization**
  - Add missing indexes per query analysis (`EXPLAIN ANALYZE`)
  - Materialized views for Analytics Engine (daily PnL, win rate)
  - Partition `GridOrder` by `createdAt` (monthly)
- [ ] **Caching Strategy** (Redis)
  - Market data: TTL 5s (ticker), 60s (candles), 300s (stats)
  - Blueprint validation: cache AI recommendations 10min
  - Portfolio: invalidate on order fill, TTL 10s
- [ ] **Read Replicas** (Production)
  - Route Analytics/Portfolio reads to replica
  - Strategy/Execution writes to primary
- [ ] **Scheduled AI Pair Recommendation Refresh**
  - Implement BullMQ job to refresh top 5 pair recommendations every **4 hours** (6x/day)
  - Cache results in Redis with TTL 4.5 hours for instant API response
  - Frontend Dashboard reads from cache — no cold start latency
  - Configurable via env: `AI_RECOMMENDATION_INTERVAL_HOURS=4`
  - Metrics: track recommendation freshness, cache hit rate, API latency

---

## Phase 2: Advanced Trading Intelligence (Weeks 5-10)
*Goal: Implement v1.1 features — Backtest, Risk Engine, Marketplace*

### 2.1 Backtest Engine (Weeks 5-7) — **New Engine: `@qis/backtest-engine`**
> **Architecture**: Follows Engine-Based Architecture — single responsibility: historical simulation with realistic execution modeling

#### 2.1.1 Core Requirements
- [ ] **Historical Data Pipeline**
  - Ingest OHLCV from multiple sources (Binance, Bybit, CoinGecko, CCXT)
  - Store in TimescaleDB (hypertable) or partitioned PostgreSQL
  - Data quality: gap detection, outlier filtering, split/dividend adjustment (crypto: funding rates)
- [ ] **Event-Driven Simulation Engine**
  - Tick-level replay (not just candle close)
  - Simulate: slippage, partial fills, latency, exchange fees, funding rates
  - Level Crossing Rule enforcement (gap protection)
  - Capital Protection Floor & maxCapitalPerMovementPercent enforcement
- [ ] **Strategy Parameter Sweep**
  - Grid search / Bayesian optimization over parameter space
  - Multi-objective: max net profit, min drawdown, max Sharpe, max win rate
  - Walk-forward analysis (train/validate/test splits)
- [ ] **Backtest API**
  - `POST /api/v1/backtest/run` — async job, returns job ID
  - `GET /api/v1/backtest/{jobId}/status` — progress, partial results
  - `GET /api/v1/backtest/{jobId}/report` — full report (HTML + JSON)
- [ ] **Report & Visualization**
  - Equity curve, drawdown chart, monthly heatmap
  - Trade list with PnL, MAE/MFE, hold time
  - Parameter sensitivity heatmaps
  - Monte Carlo simulation (resample trades)

#### 2.1.2 Integration Points
- Uses `@qis/grid-engine` for grid generation
- Uses `@qis/execution-engine` logic for fill simulation (extracted to shared)
- Uses `@qis/market-engine` for historical data access
- Results feed `@qis/analytics-engine` for strategy comparison

### 2.2 Risk Engine (Weeks 8-9) — **New Engine: `@qis/risk-engine`**
> **Architecture**: Real-time risk monitoring & pre-trade checks — independent engine with veto power

#### 2.2.1 Pre-Trade Risk Checks (Sync, <5ms)
- [ ] **Capital Allocation**: Verify uncommitted balance (Portfolio Engine)
- [ ] **Position Limits**: Max concurrent strategies, max capital per pair
- [ ] **Correlation Risk**: Prevent over-exposure to correlated pairs (BTC/ETH)
- [ ] **Volatility Circuit Breaker**: Block new strategies if market volatility > threshold
- [ ] **Drawdown Guard**: Block if portfolio drawdown > user-defined limit

#### 2.2.2 Real-Time Monitoring (Async, Event-Driven)
- [ ] **Portfolio-Level**: Aggregate exposure, VaR (95%, 99%), expected shortfall
- [ ] **Strategy-Level**: Unrealized PnL, margin pressure (though spot only), floor proximity
- [ ] **Exchange-Level**: API latency, error rate, rate limit headroom
- [ ] **Alerts**: WebSocket push to frontend, Notification Engine (Telegram/Email)

#### 2.2.3 Risk Dashboard (Frontend)
- [ ] Risk score per strategy (0-100)
- [ ] Portfolio risk heatmap
- [ ] Historical risk events timeline
- [ ] User-configurable risk limits

### 2.3 AI Strategy Marketplace (Week 10) — **New Engine: `@qis/marketplace-engine`**
> **Architecture**: Community-driven strategy sharing with verification & monetization

#### 2.3.1 Core Features
- [ ] **Strategy Publishing**
  - Blueprint + backtest results (verified by platform)
  - AI reasoning + performance metrics
  - Versioning (immutable once published)
- [ ] **Discovery & Search**
  - Filter by: pair, section count, risk profile, timeframe, performance
  - Sort by: Sharpe, net profit, win rate, max drawdown
- [ ] **Verification System**
  - Platform re-runs backtest on publish (tamper-proof)
  - Badge: "Verified Backtest", "Live Track Record"
- [ ] **Copy/Import Flow**
  - One-click import to AI Strategy Builder (pre-fills parameters)
  - Trader adjusts capital/allocation → new Blueprint generated
- [ ] **Leaderboards & Social**
  - Top strategies by risk-adjusted return
  - Creator profiles, followers, comments
  - Revenue share (future: subscription/tips)

---

## Phase 3: Platform Excellence (Weeks 11-16)
*Goal: Multi-region HA, Advanced AI/ML, Compliance, Developer Experience*

### 3.1 Multi-Region High Availability (Weeks 11-12)
- [ ] **Active-Active Deployment**
  - API: 2+ regions behind global load balancer (Cloudflare / AWS ALB / GCP LB)
  - Worker: Partition strategies by exchange:symbol across workers
  - AI Service: Stateless, horizontal scaling with Redis queue
- [ ] **Database**
  - Primary in Region A, synchronous replica in Region B (RDS Multi-AZ / Cloud SQL HA)
  - Read replicas in each region
  - Failover testing (monthly chaos drill)
- [ ] **Stateful Components**
  - Redis: Redis Cluster (3 masters + replicas) or managed (ElastiCache / Memorystore)
  - WebSocket: Sticky sessions or shared state via Redis Pub/Sub
  - BullMQ: Shared Redis, workers in each region
- [ ] **Disaster Recovery**
  - RPO < 1min (synchronous replication)
  - RTO < 5min (automated failover + health checks)
  - Runbook documentation + quarterly DR test

### 3.2 Advanced AI/ML Platform (Weeks 13-14)
- [ ] **MLOps Pipeline**
  - Feature Store (Feast or custom): Technical indicators, market regime labels
  - Model Registry: Versioned models (pair recommendation, grid optimization)
  - Training Pipeline: Scheduled retraining (weekly) with new data
  - A/B Testing Framework: Shadow mode → Canary → Full rollout
- [ ] **Model Serving**
  - Triton Inference Server or FastAPI + ONNX Runtime
  - Batch inference for pair recommendations (top 20 pairs every 5min)
  - Online inference for strategy parameters (<100ms p99)
- [ ] **Explainability & Monitoring**
  - SHAP values for feature importance
  - Drift detection (input distribution, prediction distribution)
  - Performance tracking (confidence calibration, Brier score)
- [ ] **Reinforcement Learning (Research)**
  - Grid parameter optimization via RL (PPO/SAC)
  - Environment: Backtest Engine with reward = risk-adjusted return
  - Safe exploration: Constrained policy optimization

### 3.3 Compliance & Audit (Week 15)
- [ ] **Immutable Audit Trail**
  - Event Sourcing: Every state change → append-only event log (Kafka / PostgreSQL)
  - Events: BlueprintCreated, StrategyStarted, OrderFilled, StrategyStopped, CapitalProtectionTriggered
  - Tamper-proof: Cryptographic chaining (hash chain) + periodic anchoring
- [ ] **Regulatory Hooks**
  - KYC/AML integration points (Sumsub, Onfido, manual review queue)
  - Transaction reporting (MiCA, FATF travel rule ready)
  - Tax reporting export (CSV, API for Koinly/CoinTracker)
- [ ] **Data Privacy**
  - GDPR: Right to erasure (anonymize, not delete trading history)
  - Data residency: EU/US/APAC deployment options
  - Encryption: At-rest (done), in-transit (TLS 1.3), in-use (enclaves future)

### 3.4 Developer Experience & Platform Ops (Week 16)
- [ ] **Local Development**
  - `docker-compose.yml` with all services (Postgres, Redis, API, Worker, AI, Web)
  - Tilt.dev / Skaffold for live reload
  - Seed scripts for realistic dev data
- [ ] **API Documentation**
  - OpenAPI 3.1 spec generated from NestJS decorators
  - Scalar/Redocly hosted docs with auth examples
  - Postman collection auto-generated
- [ ] **SDKs**
  - TypeScript SDK (generated from OpenAPI)
  - Python SDK (for quant researchers)
- [ ] **Feature Flags** (LaunchDarkly / Unleash / custom)
  - Gradual rollout: Backtest, Marketplace, Risk Engine
  - Kill switches per engine
- [ ] **Chaos Engineering**
  - LitmusChaos / Gremlin scenarios
  - Monthly: Worker kill, API latency injection, DB failover, Redis partition

---

## Phase 4: v2.0 — Ecosystem Expansion (Weeks 17-28)
*Goal: Copy Trading, Mobile App, Multi-Account, Institutional Features*

### 4.1 Copy Trading (Weeks 17-20) — **New Engine: `@qis/copy-trading-engine`**
- [ ] **Leader/Investor Model**
  - Leaders: Publish live strategies with verified track record
  - Investors: Allocate capital, set risk limits (max drawdown, max allocation)
- [ ] **Proportional Execution**
  - Leader places order → Investor orders placed pro-rata
  - Slippage sharing (leader gets better fill, investor gets same or worse)
  - Fee structure: Performance fee (high-water mark) + management fee
- [ ] **Risk Controls**
  - Investor: Stop-copy on drawdown, max concurrent copies, pair blacklist
  - Platform: Leader verification, max AUM per leader, correlation limits
- [ ] **Frontend**
  - Leaderboard with risk-adjusted metrics
  - Copy wizard (select leader → set allocation → confirm)
  - Live copy dashboard (PnL, open positions, fees)

### 4.2 Mobile Application (Weeks 21-24)
- [ ] **Tech Stack**: React Native (Expo) + TypeScript
  - Shared `@qis/shared` types via monorepo
  - Shared API client (generated from OpenAPI)
  - Native WebSocket (react-native-webSocket) for real-time
- [ ] **Core Features (MVP)**
  - Dashboard: Portfolio, active strategies, AI recommendations
  - Strategy Builder: Full flow (pair → capital → sections → AI Build → Simulate → Approve)
  - Trading: Live grid view, order status, PnL
  - Push Notifications: Order fills, capital protection, drawdown alerts
  - Settings: Exchange accounts, notifications, security (2FA, biometric)
- [ ] **App Store / Play Store**
  - TestFlight / Internal Testing → Beta → Production
  - CodePush for OTA updates (non-binary changes)

### 4.3 Multi-Account / Sub-Account Support (Weeks 25-26)
- [ ] **Account Hierarchy**
  - Master Account → Sub-Accounts (isolated capital, shared KYC)
  - API Key per sub-account (exchange-level isolation)
  - Aggregated reporting at master level
- [ ] **Use Cases**
  - Fund managers: Multiple client sub-accounts
  - Families: Separate strategies per member
  - Testing: Paper trading sub-account alongside live

### 4.4 Institutional Features (Weeks 27-28)
- [ ] **FIX API / WebSocket Professional**
  - Low-latency order entry (<10ms)
  - Order management: Replace, Cancel/Replace, Mass Cancel
- [ ] **Prime Brokerage Integration**
  - Custody: Fireblocks, Copper, Anchorage
  - Settlement: Batch settlement, net PnL reporting
- [ ] **White-Label / API Partnership**
  - Embedded Qis: Partners offer grid trading under their brand
  - Revenue share model
  - Partner dashboard (their users, their branding)

---

## Cross-Cutting Concerns (Ongoing)

### Security Hardening
| Task | Frequency |
|------|-----------|
| Penetration Testing | Quarterly (external) + Monthly (internal) |
| Dependency Updates | Weekly (Dependabot + manual review) |
| Secret Rotation | Quarterly (Master Key, Exchange API Keys, JWT secrets) |
| Red Team Exercise | Annually |
| Bug Bounty Program | Launch post v1.0 (HackerOne / Immunefi) |

### Performance Benchmarks (Target)
| Metric | Target |
|--------|--------|
| API p99 Latency | < 200ms |
| Grid Order Trigger → Fill | < 500ms (network dependent) |
| Backtest (1yr, 1h candles) | < 30s |
| AI Pair Recommendation | < 2s (batch 20 pairs) |
| WebSocket Message Latency | < 50ms (API → Frontend) |
| Concurrent Strategies | 10,000+ |
| Concurrent WebSocket Connections | 50,000+ |

### Testing Strategy
| Layer | Tools | Coverage Target |
|-------|-------|-----------------|
| Unit | Vitest | 90%+ (business logic) |
| Integration | Vitest + Testcontainers | 80% (Engine interactions) |
| Contract | Pact | 100% (API contracts) |
| E2E | Playwright | 100% (critical user flows) |
| Load | k6 | 2x expected peak |
| Chaos | LitmusChaos | Monthly |

---

## Team & Resource Plan

| Role | Phase 1-2 | Phase 3 | Phase 4 |
|------|-----------|---------|---------|
| Senior AI/ML Engineer | 1 | 1 | 1 |
| Senior Backend Engineer (TypeScript/NestJS) | 2 | 2 | 2 |
| Senior Backend Engineer (Python/FastAPI) | 1 | 1 | 1 |
| Frontend Engineer (Next.js/React Native) | 1 | 1 | 2 |
| DevOps / Platform Engineer | 1 | 1 | 1 |
| QA / SDET | 0.5 | 1 | 1 |
| Product Manager | 0.5 | 0.5 | 1 |
| **Total** | **7** | **7.5** | **9** |

---

## Milestones & Delivery Dates

| Milestone | Target Date | Deliverable |
|-----------|-------------|-------------|
| **M1: Production Hardening Complete** | Week 4 | Observability, CI/CD, Resilience, DB Optimization |
| **M2: Backtest Engine Beta** | Week 7 | Backtest API + Report UI |
| **M3: Risk Engine Live** | Week 9 | Pre-trade checks + Risk Dashboard |
| **M4: Marketplace Launch** | Week 10 | Strategy Publishing + Discovery |
| **M5: Multi-Region HA** | Week 12 | Active-Active + DR Test Passed |
| **M6: MLOps Platform** | Week 14 | Model Registry + A/B Testing |
| **M7: Compliance Ready** | Week 15 | Audit Trail + KYC Hooks |
| **M8: Copy Trading Beta** | Week 20 | Leader/Investor Flow |
| **M9: Mobile App (iOS/Android)** | Week 24 | App Store + Play Store |
| **M10: v2.0 GA** | Week 28 | Multi-Account + Institutional |

---

## Risk Register & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Exchange API changes break Execution Engine | Medium | High | Provider abstraction layer + integration tests per exchange |
| AI Service latency spikes | Medium | Medium | Circuit breaker + heuristic fallback + async processing |
| Regulatory changes (MiCA, SEC) | Medium | High | Modular compliance engine + legal counsel retainer |
| Key person dependency (solo dev areas) | High | Medium | Documentation + cross-training + bus factor ≥ 2 per engine |
| WebSocket scaling limits | Low | High | Load test early + Redis Pub/Sub horizontal scaling |
| Database write bottleneck (GridOrder) | Medium | High | Partitioning + batch inserts + async event processing |
| Crypto market crash (liquidity crisis) | Low | Critical | Capital protection rules + kill switch + circuit breakers |

---

## Success Metrics (KPIs)

### Technical
- **Availability**: 99.95% (≤ 4.38h downtime/year)
- **Latency p99**: < 200ms (API), < 500ms (trigger→fill)
- **Error Rate**: < 0.1% (5xx), < 1% (4xx)
- **Deployment Frequency**: Daily (main), On-demand (hotfix)
- **MTTR**: < 15min (critical), < 1h (major)

### Business
- **Active Strategies**: 1,000+ by M6, 10,000+ by M10
- **Monthly Trading Volume**: $10M+ by M6, $100M+ by M10
- **User Retention (30d)**: > 60%
- **Strategy Win Rate (median)**: > 55%
- **Net Profit (median user)**: Positive after fees
- **NPS**: > 50

### AI/ML
- **Pair Recommendation Accuracy**: > 65% (top 5 contains best performer)
- **Backtest → Live Correlation**: > 0.7 (Sharpe, drawdown)
- **Model Drift Detection**: < 24h to alert
- **A/B Test Velocity**: 2+ experiments/month

---

## AI/ML Skill Requirements (Team Competencies)

### Current AI System Skills (MVP)
| Skill Area | Competency | Implementation |
|------------|------------|----------------|
| **Technical Analysis** | Expert | RSI(14), Bollinger Bands(20,2), ATR%(14), Volatility, Trend (EMA20/50), Sideways Detection |
| **Pattern Recognition** | Advanced | Grid suitability scoring, regime classification (low/med/high volatility), confidence calibration |
| **Explainable AI** | Advanced | Natural language reasoning generation for every recommendation (why, confidence, risk) |
| **Parameter Optimization** | Advanced | Grid distance, section gap, grid count, min net profit per section based on ATR/volatility |
| **Risk Modeling** | Intermediate | Capital protection floor (dynamic), max capital per movement, max drawdown alert thresholds |
| **LLM Integration** | Intermediate | Multi-provider (OpenAI/Anthropic/Gemini) for reasoning enrichment, fallback to heuristics |

### Phase 2-3 AI/ML Skills (v1.1 → v2.0)
| Skill Area | Competency | Target Implementation |
|------------|------------|----------------------|
| **MLOps Engineering** | Expert | Feature store, model registry, CI/CD for ML, automated retraining pipelines |
| **Model Serving** | Expert | Triton/ONNX Runtime, batch + online inference, <100ms p99 latency |
| **A/B Testing & Experimentation** | Expert | Shadow → Canary → Rollout framework, statistical significance testing |
| **Drift Detection** | Advanced | Input distribution shift, prediction distribution shift, concept drift alerts |
| **Reinforcement Learning** | Research | Grid parameter optimization via PPO/SAC, constrained policy optimization |
| **Backtest Simulation** | Expert | Event-driven tick-level replay, realistic slippage/fee/funding modeling |
| **Portfolio Risk Modeling** | Advanced | VaR (95/99%), Expected Shortfall, correlation risk, factor models |
| **Time Series Forecasting** | Advanced | Volatility forecasting (GARCH/Realized Vol), regime switching models (HMM) |
| **Causal Inference** | Research | Strategy attribution (alpha vs beta), intervention analysis |
| **ML Security** | Intermediate | Adversarial robustness, model extraction prevention, data poisoning detection |

### Hiring Profile: Senior AI/ML Engineer
| Requirement | Details |
|-------------|---------|
| **Education** | MSc/PhD in CS, Statistics, Math, Physics, or Quant Finance |
| **Experience** | 5+ years ML in production (fintech/trading preferred) |
| **Core Stack** | Python (PyTorch/TensorFlow/scikit-learn), FastAPI, ONNX, Triton |
| **MLOps** | MLflow/Weights&Biases, Feast, Kubeflow/Airflow, Prometheus/Grafana |
| **Trading Domain** | Market microstructure, grid/mean-reversion strategies, risk management |
| **Soft Skills** | Explainable AI communication, cross-functional collaboration, documentation |

---

## Budget Estimate (Annual, USD)

| Category | Phase 1-2 | Phase 3 | Phase 4 |
|----------|-----------|---------|---------|
| Personnel (7-9 FTE) | $1.2M | $1.3M | $1.6M |
| Infrastructure (Cloud, DB, Redis, K8s) | $120K | $250K | $500K |
| Third-Party APIs (Exchange, AI, KYC, Monitoring) | $60K | $100K | $200K |
| Security (Pentest, Bug Bounty, Audits) | $50K | $75K | $150K |
| Mobile (App Store, Devices, Testing) | - | - | $80K |
| **Total** | **$1.43M** | **$1.725M** | **$2.53M** |

---

## Appendix: Architecture Decision Records (ADRs) to Create

| ADR | Title | Status |
|-----|-------|--------|
| ADR-001 | Engine-Based Architecture | ✅ Accepted |
| ADR-002 | Envelope Encryption for Secrets | ✅ Accepted |
| ADR-003 | Trigger-Based Market Order Execution | ✅ Accepted |
| ADR-004 | Python AI Service for Technical Analysis | ✅ Accepted |
| ADR-005 | WebSocket for Real-Time Updates | ✅ Accepted |
| ADR-006 | **NEW**: Backtest Engine as Separate Engine | 📝 Proposed |
| ADR-007 | **NEW**: Risk Engine with Veto Power | 📝 Proposed |
| ADR-008 | **NEW**: Event Sourcing for Audit Trail | 📝 Proposed |
| ADR-009 | **NEW**: Multi-Region Active-Active | 📝 Proposed |
| ADR-010 | **NEW**: MLOps Platform Architecture | 📝 Proposed |
| ADR-011 | **NEW**: Copy Trading Execution Model | 📝 Proposed |
| ADR-012 | **NEW**: React Native for Mobile | 📝 Proposed |

---

## Final Notes

This plan transforms Qis from a **well-architected MVP** into a **world-class, institutional-grade AI trading platform**. The phased approach ensures:

1. **Risk Mitigation**: Critical production gaps closed first (Phase 1)
2. **Value Delivery**: v1.1 features (Backtest, Risk, Marketplace) unlock user value early (Phase 2)
3. **Scalability Foundation**: Multi-region, MLOps, Compliance enable growth (Phase 3)
4. **Ecosystem Play**: Copy Trading, Mobile, Multi-Account create moat (Phase 4)

**The Engine-Based Architecture is the key enabler** — every new capability (Backtest, Risk, Marketplace, Copy Trading) adds a new engine without modifying existing ones. This preserves the 95/100 architecture soundness while expanding functionality.

**Next Step**: Review this plan with stakeholders, prioritize Phase 1 items, assign owners, and begin sprint planning.