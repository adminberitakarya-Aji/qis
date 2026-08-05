# LOVABLE.md

# Qis UI/UX Constitution

Version: 1.0

---

# Introduction

Qis is an AI-Assisted Grid Trading Platform.

The purpose of the interface is to help traders understand market opportunities, build intelligent strategies, and execute them with confidence.

The interface should always be:

- Simple
- Clear
- Consistent
- Transparent
- Professional

Every screen should guide users toward the next logical action.

---

# Product Philosophy

The UI must always reinforce the core philosophy of Qis.

AI analyzes.

AI recommends.

Trader decides.

System executes.

The interface must never imply that AI trades automatically.

---

# Design Principles

## Simplicity

Keep every screen clean.

Avoid unnecessary elements.

Every component must have a clear purpose.

---

## Clarity

Present information in a way that is easy to understand.

Avoid unnecessary trading jargon.

Prioritize readability over visual complexity.

---

## Transparency

Every AI recommendation must explain:

- Why
- Confidence
- Risk

Never display unexplained AI decisions.

---

## User Control

Users always remain in control.

AI only assists.

The system never performs autonomous trading.

---

## Consistency

Maintain consistent:

- Layout
- Spacing
- Colors
- Typography
- Components
- Navigation
- Interaction Patterns

The same action should always behave the same way.

---

# Design Style

The application should feel:

Modern

Minimal

Professional

Trustworthy

Fast

Responsive

Dark Theme First

---

# Color System

Primary

Blue

Secondary

Purple

Success

Green

Warning

Orange

Danger

Red

Background

Dark Gray

Surface

Gray

Text

High Contrast

Colors should communicate meaning, not decoration.

---

# Typography

Readable

Consistent

Clear hierarchy

Comfortable spacing

Never sacrifice readability for style.

---

# Layout

Use a standard dashboard layout.

Sidebar

Top Navigation

Main Content

Maintain generous spacing.

Avoid clutter.

---

# Navigation

Primary Navigation

- Dashboard
- AI Strategy
- Trading
- Portfolio
- Analytics
- Exchanges
- Settings

Navigation should remain stable throughout the application.

---

# Dashboard

The Dashboard provides an overview.

Display:

- Portfolio Summary
- Active Strategies
- Active Orders
- Daily Profit
- Market Overview
- Top 5 AI Pair Recommendations
- Recent Activity

Avoid displaying excessive detail.

---

# AI Strategy

This is the core feature of Qis.

The workflow should be:

Select Trading Pair

↓

Input Capital

↓

Choose Section Count

↓

Configure Allocation

↓

AI Build Strategy

↓

Display Strategy Blueprint

↓

Display AI Reasoning

↓

Display Simulation

↓

Approve Strategy

The workflow should feel guided and intuitive.

---

# Strategy Blueprint

Display:

- Trading Pair
- Capital
- Section Count
- Allocation
- Grid Count
- Grid Distance
- Section Gap
- Take Profit
- Estimated Fees
- Estimated Net Profit
- Estimated Drawdown
- Confidence Score
- AI Reasoning

All information should fit naturally on a single page without overwhelming the user.

---

# Trading

Display:

- Running Strategies
- Grid Orders
- Active Positions
- Current Profit
- Order Status
- Remaining Capital

Updates should be near real-time.

---

# Portfolio

Display:

- Total Balance
- Assets
- Active Positions
- Profit & Loss
- Trading History

Focus on readability.

---

# Analytics

Display:

- Net Profit
- Win Rate
- Fees
- Drawdown
- Monthly Performance
- Performance Trends

Charts should communicate information, not decoration.

---

# AI Recommendation

Each AI recommendation must display:

- Trading Pair
- Confidence Score
- Market Summary
- AI Reasoning

Primary Action:

Build Strategy

Recommendations must always explain the reasoning.

---

# Forms

Forms should be:

Simple

Validated

Well Structured

Use sensible defaults.

Provide immediate validation feedback.

---

# Tables

Tables should support:

- Sorting
- Searching
- Filtering
- Responsive Layout

Avoid excessive columns.

---

# Charts

Prefer simple charts.

Examples:

- Line Chart
- Area Chart
- Bar Chart
- Donut Chart

Avoid decorative visualizations.

---

# Components

Prefer reusable components.

Examples

- Button
- Card
- Input
- Select
- Badge
- Modal
- Drawer
- Table
- Chart
- Notification

Avoid duplicate components.

---

# Loading States

Every asynchronous action must provide loading feedback.

Users should always know that the system is processing.

---

# Empty States

Every empty page should guide users.

Example:

No Active Strategy

↓

Build Your First AI Strategy

---

# Error States

Error messages should be:

Friendly

Clear

Actionable

Never expose technical implementation details.

---

# Accessibility

Support:

- Keyboard Navigation
- High Contrast
- Visible Focus States
- Readable Typography

Icons should never be the only source of information.

---

# Responsive Design

Desktop First

Tablet Supported

Mobile Friendly

Core functionality must remain available on all supported devices.

---

# UI Responsibilities

The Frontend is responsible for:

- Presenting Information
- Collecting User Input
- Displaying API Responses
- Guiding User Workflows

The Frontend must never:

- Calculate Grid Distance
- Calculate Section Gap
- Calculate Profit
- Calculate Fees
- Generate Strategy Blueprints
- Implement Business Rules

Business logic always belongs to the Backend.

---

# Design Rules

Always follow:

- PRODUCT.md
- BUSINESS_RULES.md
- ARCHITECTURE.md
- API_CONTRACT.md

Do not invent new business terminology.

Do not modify user workflows without justification.

Keep the experience simple, predictable, and consistent.

---

# Final Principle

Qis is not a Trading Bot.

Qis is an AI-Assisted Grid Trading Platform.

Every interface should reinforce one message:

AI Plans.

Trader Decides.

System Executes.

This philosophy must remain consistent throughout the entire application.