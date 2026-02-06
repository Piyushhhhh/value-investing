# Value Check — PRD v0.2 (MVP)

Date: 2026-02-06
Owner: Piyush

## Goal
Help retail investors quickly assess whether a US stock looks undervalued using a transparent, guided process and a clear margin-of-safety verdict.

## Target Users
- Newer value-investing learners
- DIY investors who want a repeatable process
- Users who want transparent assumptions instead of a black-box score

## Problem Statement
Existing tools either show a quick buy/sell or a complex screener. Users want a single-stock decision workflow that is transparent, auditable, and easy to repeat.

## Product Principles
- Assumptions first, valuation second
- Explainable scoring
- Daily-refresh data is acceptable
- Make uncertainty explicit

## MVP Scope
- Single-stock analysis
- Value checklist with pass/fail and final score
- Valuation range + margin of safety
- Basic solvency / risk summary
- AI-generated investment memo (editable)
- Shareable snapshot view

## Out of Scope (MVP)
- ETF comparison (Phase 2)
- Portfolio tracking
- Social/community features
- Real-time data
- User accounts (no login)

## Value Framework (MVP)
Checklist with 10 signals. Each signal is pass/fail and contributes 1 point to the final score.

1. Gross Margin > 40%
2. SG&A Efficiency < 30%
3. R&D Reliance < 30%
4. Net Margin > 20%
5. Consistent Earnings (profitability in last 5–10 years, based on available data)
6. Interest Coverage > 6x
7. Debt / Equity < 0.5
8. ROE > 15%
9. Capex Efficiency < 50%
10. $1 Test > 1.0

Final Score: 0–10
Verdict mapping:
- 8–10: Strong
- 5–7: Mixed
- 0–4: Weak

## Valuation Models (MVP)
- DCF (conservative + base + optimistic)
- Graham
- Lynch

Output:
- Intrinsic value range vs. current price
- Margin of safety percentage
- Implied growth (market pricing)

## User Flow
1. Home: search + trending
2. Analyzer: checklist + score
3. Fair Value: valuation range + margin of safety
4. Memo: auto summary + editable notes
5. Snapshot: shareable view

## Data Strategy (Free-Tier Only)
Primary source: Financial Modeling Prep (FMP) free tier.
- Cache everything server-side
- Daily refresh (not real-time)
- Strict rate limiting
- Show “Last updated” timestamp

## Caching & Rate Limits
- Trending tickers refreshed daily
- On-demand ticker data cached for 24h
- Hard cap: ~20–30 new tickers per day
- One refresh per ticker per 24h
- Block repeated refreshes from same IP

## Tech Architecture
- Frontend: static site on GitHub Pages
- Backend: Firebase Functions (proxy + cache)
- Storage: Firestore
- Optional: Cloud Scheduler to refresh trending list

## Success Metrics
- Activation: % of visitors who complete a valuation
- Engagement: avg. assumption edits per session
- Share rate: % of snapshots created
- Return: % of users who revisit within 7 days

## Risks
- Free-tier data limits and licensing constraints
- Users misinterpret valuation as advice
- Limited data depth vs. paid tools

## Decisions (Locked)
- US only
- Daily refresh
- ETFs in Phase 2
- FMP free tier + aggressive caching
- No login for MVP

## Expanded Trending List (Initial)
Configurable list to pre-cache daily. Initial suggestion (20):
AAPL, MSFT, GOOGL, AMZN, NVDA, BRK.B, META, TSLA, UNH, JPM,
V, XOM, AVGO, MA, LLY, WMT, COST, HD, KO, PEP
