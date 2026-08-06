# BUSINESS_RULES.md

# Qis Business Rules

Version: 1.1

---

# Introduction

This document defines the official business rules of Qis.

Every Engine, API, AI module, Simulation, and Trading Execution must follow these rules.

Business Rules are the highest authority for all trading logic.

If a business rule is missing or unclear, implementation must stop until clarification is provided.

---

# Trading Model

Qis is an AI-Assisted Multi-Section Grid Trading Platform.

The AI analyzes market conditions and generates a Strategy Blueprint.

The trader reviews the Blueprint.

The trader decides whether to approve it.

The system executes the approved Blueprint exactly as defined.

---

# Supported Trading

Current Version

- Binance Spot
- Bybit Spot

Not Supported

- Futures
- Margin
- Leverage
- Options

---

# User Rules

Before building a strategy, the user must provide:

- Exchange
- Trading Pair
- Trading Capital
- Section Count
- Capital Allocation

Optional:

- Risk Preference

The user always owns these values.

AI cannot modify user input.

---

# AI Pair Recommendation

The dashboard displays five AI-recommended trading pairs.

Each recommendation must include:

- Pair
- Confidence Score
- AI Reasoning

The trader chooses which pair to trade.

AI cannot automatically start trading.

---

# Strategy Blueprint

Every strategy begins with a Blueprint.

A Blueprint contains:

- Trading Pair
- Trading Capital
- Section Count
- Capital Allocation
- Grid Count
- Grid Distance
- Section Gap
- Take Profit
- Confidence Score
- AI Reasoning

Trading cannot begin without a Blueprint.

---

# Blueprint Rules

## Blueprint Generation

Blueprint is generated only after the user requests:

AI Build Strategy

---

## Blueprint Approval

Every Blueprint must be reviewed by the trader.

Trading cannot start until the Blueprint is approved.

---

## Blueprint Freeze Rule

Once approved,

the Blueprint becomes immutable.

Execution Engine must execute exactly as approved.

No Engine may modify:

- Grid Count
- Grid Distance
- Section Gap
- Allocation
- Take Profit

If market conditions change,

AI must generate a NEW Blueprint.

The trader decides whether to:

- Continue the current Blueprint
- Stop the current Blueprint
- Approve the new Blueprint

---

# Section Rules

A strategy may contain:

- 1 Section
- 2 Sections
- 3 Sections

The number of Sections is chosen by the trader.

---

# Capital Allocation

Every Section has its own capital allocation.

Example

Section 1

35%

Section 2

35%

Section 3

30%

The total allocation must always equal 100%.

---

# Grid Rules

Every Section contains one or more Grid Orders.

Each Grid Order is completely independent.

Every Grid Order owns:

- Entry Price
- Take Profit
- Status

Grid Orders never depend on one another.

---

# Grid Distance

Grid Distance is constant inside one Section.

Example

100

99

98

97

96

The spacing between all orders inside the same Section must remain identical.

---

# Section Gap

Section Gap is NOT Grid Distance.

Section Gap is measured from:

The last Grid Order of the previous Section

to

The first Grid Order of the next Section.

Example

Section 1

100

99

98

97

96

↓

Section Gap

3%

↓

Section 2

93.12

92.19

91.27

Section Gap is determined by AI.

Each Section may have a different Section Gap.

---

# Grid Count

Each Section may contain a different number of Grid Orders.

Example

Section 1

10 Orders

Section 2

7 Orders

Section 3

5 Orders

Grid Count is determined by AI.

---

# Take Profit

Every Grid Order owns its own Take Profit.

Take Profit belongs to the individual Grid Order.

The platform does not wait for basket profit.

One completed order does not affect other orders.

## Take Profit Calculation

Take Profit is calculated from the **actual executed price**, not the grid level price.

This is because execution uses market orders, so the actual fill price may differ from the grid level due to slippage.

TP Price is calculated using the Net Profit formula:

```
TP_Price = Buy_Executed_Price × (1 + min_net_profit% + buy_fee% + sell_fee% + est_slippage%)
```

## Section Take Profit Rule

Every Section has one `min_net_profit_percent` value.

All Grid Orders inside the same Section use the same `min_net_profit_percent`.

Deeper Sections (lower price) must have a higher `min_net_profit_percent` because they carry higher risk.

Example

Section 1

min_net_profit_percent = 0.5%

Section 2

min_net_profit_percent = 0.8%

Section 3

min_net_profit_percent = 1.2%

AI recommends `min_net_profit_percent` for each Section with reasoning.

The trader may adjust the value before approval.

The trader always owns the final decision.

---

# Order Lifecycle

Every Grid Order follows this lifecycle.

Buy Executed (market)

↓

Sell Executed (market)

↓

Completed

Every order is independent.

There is no Pending state.

There is no Waiting Take Profit state.

Execution is instant.

---

# Trading Execution

Execution Engine is deterministic.

Execution Engine must never:

- Analyze the market
- Modify the Blueprint
- Optimize the strategy

Execution Engine only executes the approved Blueprint.

## Instant Execution

Qis uses **market orders** for both Buy and Sell.

The system does not place limit orders in the order book.

The system monitors the market price in real-time.

When the market price touches or crosses a grid level, the system executes a market order instantly.

There is no order queue.

There is no risk of an order failing to fill because the price moved away.

## Level Crossing Rule

When the market price crosses multiple grid levels at once (a gap), all crossed levels are executed.

Example

Price drops from 100 to 95 in one move.

Grid levels at 99, 98, 97, 96 are all crossed.

All four levels are executed at the current market price.

This preserves the grid structure and prevents missed fills.

## Capital Protection on Gaps

To protect against extreme flash crashes, a Blueprint may define a maximum percentage of capital that can be executed in a single price movement.

Example

Max 40% of capital per price movement.

If a gap would trigger more than 40% of capital, only the first 40% is executed.

The remaining levels wait for the next price movement.

This is a protection rule, not a rate limit on time.

---

# Simulation Rules

Every Blueprint must be simulated before execution.

Simulation estimates:

- Capital Usage
- Order Count
- Average Entry
- Estimated Fees
- Estimated Net Profit
- Estimated Drawdown

Simulation is an estimation only.

Simulation does not guarantee future performance.

---

# Profit Rules

All profit calculations must use Net Profit.

Net Profit includes:

- Buy Fee
- Sell Fee
- Exchange Fee

Profit displayed to users must always be Net Profit.

---

# AI Rules

AI may:

- Analyze Market
- Recommend Trading Pair
- Recommend Grid Count
- Recommend Grid Distance
- Recommend Section Gap
- Recommend Take Profit
- Generate Strategy Blueprint
- Explain Recommendations
- Calculate Confidence Score

AI may NOT:

- Execute Orders
- Modify User Capital
- Modify User Allocation
- Modify Approved Blueprint
- Start Trading Automatically

---

# Explainable AI

Every AI recommendation must include reasoning.

Examples:

Why this Pair?

Why this Section Count?

Why this Grid Count?

Why this Section Gap?

Why this Take Profit?

AI recommendations must always be explainable.

No black-box decisions are allowed.

---

# Final Principle

Qis follows one fundamental philosophy.

AI analyzes.

AI recommends.

Trader decides.

System executes.

This principle must never change.