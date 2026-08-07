# Qis — Implementation Roadmap (Solo-Dev Edition)
**AI-Assisted Grid Trading Platform**
**Version:** 3.0 — rewritten to fit a single developer working across multiple projects
**Supersedes:** `WORLD_CLASS_IMPLEMENTATION_PLAN.md` v2.0 (institutional/enterprise-team sizing)

---

## Why this version exists

The v2.0 plan is a good *reference* of what a mature trading platform eventually needs — but as written it assumes a team: dedicated SRE for OpenTelemetry/Jaeger/Prometheus/Alertmanager, a platform team for multi-region K8s, an MLOps engineer for feature stores and model registries, and a compliance function for KYC/AML hooks. Taken literally, "Phase 1: Weeks 1-4" alone is 2-3 months of solo part-time work, before a single new trading feature ships.

This version reorders and resizes the same underlying goals around one question: **what's the smallest thing that materially reduces risk or unlocks the next feature, given that real money is already moving through this system?**

Two hard constraints shaped every decision below:
1. **This platform executes real market orders.** Two race conditions were found and fixed in `triggerGridOrder()` and `stopExecution()` — both were silent failure modes (duplicate buys, duplicate cancels) that nothing in the system would have surfaced on its own. That's the actual current risk profile, not "95/100 architecture soundness."
2. **One person, several projects.** Aji Kopi, PAO Companion, Suro & Buya, BeritaKarya, and Qis all compete for the same hours. Anything that only pays off at institutional scale is explicitly deferred, not scheduled.

---

## Current State — grounded assessment

| Area | Real status |
|---|---|
| Core engines (Strategy, AI, Market, Grid, Execution, Exchange, Portfolio, Analytics, Notification) | Implemented, reasonably well-separated by responsibility |
| Secrets handling | Solid — AES-256-GCM envelope encryption, key versioning, decrypt-only-at-point-of-use |
| Money-safety race conditions | 2 found and fixed (order trigger, strategy stop) via atomic `updateMany` claims. Pattern should be treated as a checklist item for any *future* status-transition code, not assumed solved everywhere. |
| Test coverage | `apps/api` was effectively **zero** until this cycle — no jest config existed, so `jest --passWithNoTests` was silently a no-op. Now wired up end-to-end (ts-jest + `@noble`/`@scure` ESM transforms for ccxt) with 7 ops-alerting tests passing. Broad coverage elsewhere is still thin. |
| `pnpm typecheck` / `pnpm build` | Passes clean end-to-end (verified after fixing a pre-existing `executeOrder()` argument-count bug in `execution-engine`) |
| Observability | Alerting only (Phase 0.1) — Telegram ops channel live for worker crashes, `triggerGridOrder`/`stopExecution` errors, exchange retry exhaustion, and Postgres connection errors. No metrics/tracing/dashboards yet (intentionally deferred). |
| CI | Live (Phase 0.2) — GitHub Actions runs `lint → typecheck → test → build` on every push/PR to `master`/`main`, plus non-blocking `pnpm audit`. |
| Backtest / Risk Engine / Marketplace | Not started |

The honest framing: **the trading core is more solid than the surrounding safety net.** That inversion is exactly what Phase 0 below exists to fix, before any new engine gets added on top.

---

## Phase 0: Minimum Safety Net (1–2 weeks, part-time)
*Goal: if something breaks with real money involved, you find out within minutes — not when a user complains.*

This is the entire "Phase 1" from v2.0, cut down to what a solo dev can actually stand up and maintain alone.

### 0.1 Alerting — the one thing that isn't optional
- [x] One Telegram bot (`@qis/notification-engine` already exists — wire a dedicated ops channel, separate from user-facing notifications) or a Slack webhook, whichever you already check on your phone.
- [x] Alert on exactly these events, nothing more at first:
  - Worker process crashes or fails to reconnect its price WebSocket after N retries
  - `triggerGridOrder` or `stopExecution` throws an unhandled error (not the expected `skipped`/`NotFoundException` paths — actual exceptions)
  - An exchange call exhausts all retries (`MAX_RETRY` reached) in `executeSingleMarketBuyEncrypted`
  - Postgres connection pool exhaustion / connection errors
- [x] Skip Prometheus/Grafana/Loki for now. `@qis/logger`'s structured JSON logs are already there — a simple log-watcher process (or even a scheduled query against error-level logs) that pings the same channel covers 80% of the value at 5% of the setup cost.

### 0.2 CI — lint/typecheck/test on every push
- [x] One GitHub Actions workflow: `pnpm install → pnpm lint → pnpm typecheck → pnpm test → pnpm build`. That's it — no staging/prod environments, no blue/green, no separate K8s namespaces.
- [x] This alone would have caught the `execution-engine` argument-count bug and the missing jest config automatically, instead of both surfacing by accident during a manual audit.
- [x] Add `pnpm audit` as a non-blocking step (report only) — full SAST/container scanning is Phase 3-or-never territory for a project this size.

### 0.3 Retry & degradation hardening (targeted, not comprehensive)
- [x] Standardize the existing retry pattern (already present in `executeSingleMarketBuyEncrypted`) with exponential backoff + jitter instead of a fixed delay — cheap change, meaningfully reduces thundering-herd risk against exchange rate limits.
- [x] Explicit circuit breaker **only** around exchange calls (Binance/Bybit) — if an exchange is erroring repeatedly, stop hammering it and alert (via 0.1) instead of burning through retries silently. Skip circuit breakers for internal engine-to-engine calls; they're not the failure-prone boundary here.
- [x] Confirm the existing WebSocket→REST polling fallback in the Worker actually gets exercised (write one test for it) rather than assuming it works because it's written.

### 0.4 Database basics
- [x] Add indexes based on actual slow-query logs once you have real usage — not speculative indexes for load you don't have yet.
- [x] Skip PgBouncer, read replicas, and table partitioning until `GridOrder` row count or connection count actually becomes a measured problem. Premature at current scale.

**What's explicitly cut from v2.0's Phase 1**: distributed tracing (OpenTelemetry/Jaeger), Prometheus/Grafana dashboards, Loki log aggregation, PagerDuty, multi-environment K8s/Railway namespace separation, load testing (k6), CodeQL/Trivy scanning, materialized views, read replicas. All genuinely useful — none of it earns its setup and maintenance cost yet. Revisit when you have paying users whose trust depends on measurable uptime.

---

## Phase 1: Backtest Engine (3–4 weeks)
*Goal: prove strategies work before risking capital on them — and unlock everything downstream (Risk Engine tuning, Marketplace verification) that depends on having a backtest at all.*

This is v2.0's section 2.1, resized. The dependency chain matters: **Risk Engine tuning and the Marketplace's "Verified Backtest" badge both need this to exist first** — so even if AI-related work is the priority, this is the correct first stop within that track, not the Marketplace itself.

### 1.1 Core (build this first, nothing else)
- [x] Historical OHLCV ingestion — reuse `@qis/market-engine`'s existing exchange fetch, store in a plain `HistoricalCandle` Postgres table (no TimescaleDB yet; revisit only if query performance actually suffers)
- [x] Candle-close simulation (not tick-level replay yet) — reuses `@qis/grid-engine`'s existing price-crossing logic directly, since that's already the exact logic running in production via the Worker
- [x] Model exchange fees and a fixed slippage assumption (e.g. 0.05%) — funding rates, partial fills, and latency simulation are Phase 2+ refinements, not blockers to a useful first backtest
- [x] One synchronous `POST /api/v1/backtest/run` endpoint returning a full result — skip the async job/status/report three-endpoint split until a backtest run is slow enough to need it

### 1.2 Minimum useful output
- [x] Equity curve + max drawdown + win rate + net profit — this is enough to compare AI-recommended grid parameters against a manual guess, which is the actual decision this engine needs to support
- [x] Defer: parameter sweep / Bayesian optimization, Monte Carlo resampling, walk-forward analysis, sensitivity heatmaps. These matter once you're optimizing an already-working strategy, not for the first version.

---

## Phase 2: Risk Engine — pre-trade checks only (1–2 weeks)
*Goal: stop a bad strategy from launching, not build a full real-time risk monitoring platform.*

v2.0 splits this into pre-trade checks (sync) and real-time monitoring (async, event-driven) plus a full risk dashboard. Ship only the sync half first:

- [ ] Capital allocation check against Portfolio Engine's uncommitted balance (this may already partially exist — verify before building)
- [ ] Max concurrent strategies per user, max capital per pair — simple config-driven limits, not a correlation-risk model
- [ ] Reuse Phase 0's alerting channel for risk events instead of building a separate risk dashboard — a Telegram message "Strategy blocked: capital limit exceeded" is enough until there's a reason to visualize it

**Deferred**: correlation risk modeling (BTC/ETH exposure), VaR/expected shortfall calculations, a dedicated risk-score UI. These require either more capital at stake or more users than currently exist to justify the build.

---

## Phase 3: Marketplace — only after Phase 1 has real backtest history (2–3 weeks)
*Goal: let strategies with a genuine track record be shared — not launch a social feature with nothing to show yet.*

This is intentionally last, and intentionally gated: publishing a "Verified Backtest" badge with no real backtests run yet is a hollow feature. Once Phase 1 has been used on your own strategies for a few weeks:

- [ ] Strategy publishing: Blueprint + backtest result snapshot, immutable once published
- [ ] Basic discovery: filter by pair and sort by net profit / win rate — skip elaborate multi-factor search until there's enough published strategies to need filtering
- [ ] Re-run backtest on publish for tamper-proofing (this is why Phase 1 needing to be synchronous/fast matters)

**Deferred indefinitely, revisit only with real user demand**: leaderboards, creator profiles/followers, revenue share, one-click import UI polish beyond a functional minimum.

---

## Deferred / Not Scheduled

Everything below is real, well-reasoned in v2.0, and **wrong to build right now** for a solo dev with no measured need yet. Listed here so the plan isn't silently lost, not because it's unimportant:

| Item | Revisit when |
|---|---|
| Multi-region HA, automated failover, DR runbooks | You have paying users in multiple regions who'd notice a single-region outage |
| MLOps pipeline (feature store, model registry, A/B testing, RL-based grid optimization) | The heuristic AI recommendations in `apps/ai-service` are demonstrably a bottleneck, not before |
| Compliance (KYC/AML hooks, MiCA/FATF reporting, event-sourced audit trail) | You're handling third-party funds or operating in a jurisdiction that requires it — for personal/beta use this is premature |
| Mobile app | Web frontend has real usage and mobile is the explicit next-requested surface |
| Copy trading, multi-account/sub-account, institutional features | Marketplace (Phase 3) has proven demand first |
| Chaos engineering, load testing at scale | You have production traffic worth stress-testing |
| Full OpenTelemetry/Prometheus/Grafana/Loki stack | Phase 0's lightweight alerting stops being enough — i.e., alert volume or debugging complexity actually outgrows a Telegram channel |

---

## Suggested Sequencing

```
Phase 0 (Safety Net)     ──▶  ~1-2 weeks, do this before anything else
        │
        ▼
Phase 1 (Backtest Engine) ──▶ ~3-4 weeks — also the correct starting point
        │                     if the priority is "AI-related" work, since
        │                     Marketplace and Risk Engine tuning both need it
        ▼
Phase 2 (Risk Engine,      ──▶ ~1-2 weeks — pre-trade checks only
  pre-trade only)
        │
        ▼
Phase 3 (Marketplace)     ──▶ ~2-3 weeks — gated on Phase 1 having real
                               backtest history to show, not just code existing
```

Total to a genuinely useful, safer, feature-complete-for-now platform: **~8-11 weeks of part-time solo work**, versus v2.0's implicit multi-quarter, multi-person scope for the same four phases. Everything past this point should be pulled forward only when a specific, real signal (an actual outage, an actual user request, actual capital at risk) justifies it — not because the checklist says it's next.