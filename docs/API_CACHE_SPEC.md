# API + Cache Spec (MVP)

## Data Sources
- Financial Modeling Prep (FMP) free tier
- SEC data (Phase 2) for fundamentals

## Firebase Functions (HTTP)

### GET /api/stock/:ticker
Returns:
- price, market cap, shares outstanding
- latest annual financials (income, balance, cash flow)
- derived ratios for checklist
- last_updated

Cache:
- 24h TTL per ticker
- cache key: stock:{ticker}

### GET /api/valuation/:ticker
Returns:
- DCF (low/base/high)
- Graham
- Lynch
- implied growth
- margin of safety

Cache:
- 24h TTL per ticker
- cache key: valuation:{ticker}

### GET /api/trending
Returns:
- list of tickers + basic snapshot

Cache:
- 24h TTL
- cache key: trending

### POST /api/memo
Input:
- ticker
- computed metrics

Returns:
- memo text + bullets

Cache:
- optional 24h TTL per ticker

## Rate Limiting
- One refresh per ticker per 24h
- Limit new ticker fetches to ~20–30/day
- IP-based throttling
- On exceed, return 429 with retry time

## Scheduled Jobs
- Daily refresh trending list
- Daily refresh for top 20 tickers

## Storage (Chosen)
Firestore
- collections: stock_cache, valuation_cache, memo_cache

## Error Handling
- If FMP quota exceeded: serve stale cached data
- If no cached data: return friendly error
