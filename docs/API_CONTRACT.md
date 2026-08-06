# API_CONTRACT.md

# Qis API Contract

Version: 1.0

---

# Overview

This document defines the communication contract between Backend and Frontend.

Its purpose is to ensure a consistent, predictable, and maintainable API.

This document defines:

- API Design Principles
- Request & Response Format
- Authentication
- API Modules
- Validation
- Error Handling

Implementation details are intentionally excluded.

---

# API Principles

Every API must follow these principles.

- RESTful
- Stateless
- JSON
- Versioned
- Predictable
- Secure

Business logic belongs only to the Backend.

Frontend is responsible only for presentation.

---

# Base URL

```
/api/v1
```

Future breaking changes require a new API version.

Example

```
/api/v2
```

---

# Standard Response

## Success

```json
{
  "success": true,
  "message": "Success",
  "data": {}
}
```

## Error

```json
{
  "success": false,
  "message": "Validation Error",
  "errors": []
}
```

All APIs must follow this response format.

---

# Authentication

Authentication uses Bearer Token.

```
Authorization: Bearer <token>
```

Protected endpoints require authentication.

---

# API Modules

The API is organized into the following business modules.

## Authentication

Responsibilities

- Register
- Login
- Logout
- Refresh Token
- User Profile

---

## Exchange

Responsibilities

- Connect Exchange
- Disconnect Exchange
- Exchange Status
- Account Balance
- Supported Trading Pairs

---

## Market

Responsibilities

- Market List
- Ticker
- Candlestick
- Order Book
- Market Statistics

Read-only.

---

## AI

Responsibilities

- Top 5 Pair Recommendation
- Market Analysis
- Confidence Score
- AI Reasoning

Read-only.

AI never executes trades.

---

## Strategy

Responsibilities

- AI Build Strategy
- Generate Blueprint
- Strategy Detail
- Strategy History

Input

- Trading Pair
- Capital
- Section Count
- Capital Allocation

Output

- Strategy Blueprint

Blueprint contains per Section:

- Grid Count
- Grid Distance
- Section Gap
- min_net_profit_percent

Each Section has one `min_net_profit_percent` value.

All Grid Orders inside the same Section use the same `min_net_profit_percent`.

---

## Simulation

Responsibilities

- Simulate Strategy Blueprint

Simulation returns

- Estimated Capital Usage
- Estimated Order Count
- Estimated Fees
- Estimated Net Profit
- Estimated Drawdown

Simulation never executes trades.

---

## Trading

Responsibilities

- Start Strategy
- Stop Strategy
- Active Orders
- Order History

Trading only accepts approved Strategy Blueprints.

Order response contains:

- grid_price (the grid level price)
- executed_price (the actual market fill price)
- tp_price (the calculated take profit price)

`executed_price` may differ from `grid_price` due to slippage.

`tp_price` is calculated from `executed_price` using the Net Profit formula.

---

## Portfolio

Responsibilities

- Balance
- Assets
- Positions
- Profit & Loss
- Trading History

Read-only.

---

## Analytics

Responsibilities

- Performance
- Statistics
- Win Rate
- Monthly Report
- Fee Summary

Read-only.

---

## Notification

Responsibilities

- Notification Settings
- Telegram
- Email
- Webhook

---

# Validation

Every request must validate

- Required Fields
- Data Types
- Business Rules

Validation errors must return meaningful messages.

---

# Error Handling

Common HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | OK |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 422 | Validation Error |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

---

# Security

Sensitive information must never be returned by any API.

Examples

- Password
- Exchange API Secret
- Private Keys
- Access Tokens

Sensitive data must always be encrypted.

---

# API Design Rules

Backend is the Single Source of Truth.

Frontend must never

- Calculate Grid
- Calculate Section Gap
- Calculate Profit
- Calculate Fees
- Generate Strategy Blueprint

Frontend only renders data returned by Backend.

---

# Feature Flow

```
Connect Exchange

↓

Load Market Data

↓

AI Pair Recommendation

↓

AI Build Strategy

↓

Strategy Blueprint

↓

Simulation

↓

User Approval

↓

Start Trading

↓

Portfolio

↓

Analytics
```

---

# Future Compatibility

New API modules may be added without affecting existing modules.

Examples

- Backtest
- Marketplace
- Risk Management
- Copy Trading

Existing API behavior must remain backward compatible whenever possible.

---

# Final Principle

The Backend owns the business logic.

The Frontend consumes APIs.

Every trading action must originate from an approved Strategy Blueprint.

This contract must remain stable across future versions.