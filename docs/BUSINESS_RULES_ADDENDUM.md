# BUSINESS_RULES_ADDENDUM.md

# Qis Business Rules — Addendum

Version: 1.2
Status: Draft, pending approval
Extends: BUSINESS_RULES.md v1.1

---

# Introduction

This addendum defines six additional business rules discovered during architecture review.

These rules are not optional extensions. They are prerequisites for building the Execution Engine and Exchange Engine safely.

Until this addendum is approved, Execution Engine implementation must not begin.

---

# 1. Capital Protection Rules

## Problem

The original Blueprint defines Grid Count, Grid Distance, and Section Gap, but does not define what happens when price falls below the lowest Grid Order of the last Section.

Without a floor, capital in the final Section has no defined exit path during a sustained price decline.

## Rule

Every Strategy Blueprint must define a **Capital Protection Floor**.

The Floor is a price level below the lowest Grid Order of the last Section.

The Floor may trigger one of the following, chosen by the trader at Blueprint approval time:

- **Pause Only** — system stops opening new orders, existing orders remain, trader is notified
- **Notify Only** — system takes no action, trader is notified
- **Hard Stop** — system cancels all pending orders in the breached Section, trader is notified

AI must calculate a recommended Floor and explain its reasoning, same as any other Blueprint parameter.

AI may never execute a Hard Stop. Hard Stop execution belongs to Execution Engine, triggered only by a rule the trader approved in advance.

## Additional Rule — Maximum Drawdown Alert

Every Blueprint must define a Maximum Drawdown Alert threshold, expressed as a percentage of Trading Capital.

When unrealized loss crosses this threshold, the trader must be notified through Notification Engine regardless of Floor status.

This is an alert, not an action. It does not modify the Blueprint or trigger execution.

## Additional Rule — Capital Protection on Gaps

Because Qis uses market orders for instant execution, a single price movement (gap) can cross multiple grid levels at once.

To protect against extreme flash crashes, every Blueprint must define a maximum percentage of Trading Capital that may be executed in a single price movement.

Example

Max 40% of capital per price movement.

If a gap would trigger more than 40% of capital, only the first 40% is executed.

The remaining crossed levels wait for the next price movement.

This is a protection rule, not a rate limit on time.

It does not modify the Blueprint or the grid structure.

It only limits how much capital is deployed in a single price movement.

---

# 2. Idempotency Rules

## Problem

Grid Trading generates a high volume of order submissions. Network retries, client timeouts, or duplicate webhook delivery can cause the same order to be submitted twice.

## Rule

Every state-changing API request must accept an **Idempotency Key** supplied by the client.

Applies to at minimum:

- Start Strategy
- Stop Strategy
- Approve Blueprint

Backend must:

- Store the Idempotency Key with the resulting state change
- Return the original result if the same key is received again
- Never execute the same state change twice for the same key

## Exchange-Level Rule

Every order submitted to Binance or Bybit must carry a Qis-generated Client Order ID that is unique per order.

Before retrying a failed order submission, Execution Engine must first query order status by Client Order ID to confirm whether the original submission actually failed or only the response was lost.

Execution Engine must never blind-retry an order submission without this check.

---

# 3. Blueprint Validity Rules

## Problem

A Blueprint may be approved by the trader but not started immediately. Market conditions can change in the gap between approval and execution.

## Rule

Every approved Blueprint has a **Validity Window**, defined in minutes, set at Blueprint generation time.

Default Validity Window: 15 minutes. This default may be changed only through a documented product decision, not by AI or by individual Engines.

If the trader attempts to Start Trading after the Validity Window has expired:

- The system must reject the Start request
- The system must prompt the trader to request a new Blueprint

Strategy Engine is responsible for enforcing the Validity Window. Execution Engine must not start any Blueprint without confirming validity first.

This rule does not apply once a Blueprint is already running. Validity only gates the transition from Approved to Started.

---

# 4. Real-Time Data Rules

## Problem

Grid Trading produces frequent, small order state changes. Polling-only APIs create both poor user experience and unnecessary load against exchange rate limits.

## Rule

The following data must be delivered through a real-time channel (WebSocket or equivalent), not polling alone:

- Order status changes
- Portfolio balance changes
- Active Grid status

REST endpoints for this data remain available for initial load and reconciliation, but must not be the primary update mechanism.

Exchange Engine owns the upstream WebSocket connection to Binance or Bybit. Business Engines never connect to an exchange WebSocket directly.

If a real-time channel disconnects, the system must fall back to polling automatically and must reconcile state once reconnected.

---

# 5. Secret Ownership Rules

## Problem

Exchange API Secrets must be encrypted at rest, but the original rules do not define which Engine may decrypt them.

## Rule

Only Exchange Engine may decrypt an Exchange API Secret.

No other Engine — including AI Engine, Strategy Engine, Grid Engine, or Execution Engine — may receive a decrypted secret in any form.

Execution Engine requests order actions from Exchange Engine through an internal interface. It never receives or handles credentials directly.

Logs must never contain a decrypted secret, a partial secret, or any request/response payload that includes one.

Every decryption event must be logged for audit purposes, without logging the decrypted value itself.

---

# 6. Concurrency Rules

## Problem

The original rules do not state whether a trader may run multiple Strategy Blueprints at once, or how capital allocation is protected from overlap.

## Rule

A trader may run multiple Strategy Blueprints concurrently, subject to the following constraints:

- Each Blueprint must specify Capital Allocation from the trader's total available balance on that exchange account
- The system must track capital already committed to active Blueprints
- A new Blueprint may not be approved if its required capital exceeds the trader's uncommitted balance
- Two active Blueprints may target the same Trading Pair, but each must reference independently allocated capital — never shared capital

Portfolio Engine is the single source of truth for committed vs. uncommitted capital. Strategy Engine must query Portfolio Engine before generating any new Blueprint.

---

# Priority

These rules must be resolved in the following order, because each depends on the one before it:

1. Secret Ownership Rules
2. Idempotency Rules
3. Concurrency Rules
4. Blueprint Validity Rules
5. Capital Protection Rules
6. Real-Time Data Rules

Execution Engine and Exchange Engine implementation should not start before Rules 1–3 are finalized.

---

# Final Principle

A Blueprint that cannot fail safely is not a complete Blueprint.

Every rule in this addendum exists to answer one question:

What happens when something goes wrong?

If the answer is undefined, the feature is not ready for implementation.
