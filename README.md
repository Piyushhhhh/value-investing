# Value Check

Value Check is a static, GitHub Pages friendly value-investing app powered by a free-tier Cloudflare Worker.
It combines SEC fundamentals with market quote data to produce fast, explainable quality and valuation checks.

## Live

Check it here:
- [https://piyushhhhh.github.io/value-investing/](https://piyushhhhh.github.io/value-investing/)

Worker API:
- [https://value-check.value-check.workers.dev](https://value-check.value-check.workers.dev)

## Core Features

- `Analyzer`: quality score, pass/fail matrix, moat signals, filing delta, and snapshots.
- `Stock Battle`: side-by-side comparison between two tickers.
- `Methodology`: plain-language explanation of each value signal and why it matters.
- `Support`: project support link and disclaimers.
- `Search`: ticker + company name search with suggestions.

## What "Free Tier" Means Here

- No paid backend services required.
- SEC data is free.
- FMP is used for quote/market-cap snapshots with an API key.
- Worker cache (Cloudflare KV) reduces repeated API calls.
- A daily cap protects free-tier usage for new tickers.
- Cached stale data is returned when possible if the cap is reached.

## Data Sources

- SEC Company Tickers: ticker-to-CIK mapping.
- SEC Company Facts (XBRL): fundamentals and accounting tags.
- SEC Submissions: filing metadata (10-K / 10-Q).
- FMP Stable Quote endpoint: price + market cap snapshots.

## Scoring Model

- Signals are scored only when required data exists.
- Missing data is shown as `No data` and does not count as fail.
- Final score denominator is dynamic (available signals only).
- Verdict labels (Strong / Mixed / Weak) are derived from score ratio.

## API Endpoints

Base URL: `https://value-check.value-check.workers.dev`

- `GET /trending`
  - Returns pre-selected, pre-cached symbols for quick starts.
- `GET /search?q=<query>`
  - Returns top ticker/name matches.
- `GET /stock/<ticker>?period=annual`
  - Returns analyzer payload for one ticker.
- `GET /stock/<ticker>?period=quarterly`
  - Returns quarterly view for supported metrics.

## Frontend Routes

Hash routes (GitHub Pages safe):

- `#/analyzer/AAPL`
- `#/compare/AAPL/MSFT`
- `#/valuation/AAPL`
- `#/memo/AAPL`
- `#/snapshot/AAPL`
- `#/methodology`
- `#/support`

## Architecture

- Static frontend: `index.html`, `app.js`, `styles.css`
- Edge API: `worker/worker.js`
- Cache store: Cloudflare KV (`CACHE_KV`)
- No server VM, no database required for core functionality

Request flow:
1. Frontend requests `/stock/<ticker>`.
2. Worker checks KV cache first.
3. On miss, Worker fetches SEC + FMP data and computes metrics.
4. Worker stores payload in KV and returns normalized JSON.
5. Frontend renders analyzer, battle, and supporting panels.

## Local Development

You can run UI only, or UI + Worker.

### UI only

Serve the project root with any static server:

```bash
cd /Users/piyushkumar/sides/value-investing
python3 -m http.server 5173
```

Open:
- `http://localhost:5173`

### Point UI to a custom Worker

Add this before `app.js` in `index.html`:

```html
<script>
  window.VALUE_CHECK_API_BASE = "https://YOUR-WORKER.workers.dev";
</script>
```

## Worker Setup and Deploy

From the `worker` directory:

```bash
cd /Users/piyushkumar/sides/value-investing/worker
```

1. Install Wrangler:
```bash
npm install -g wrangler
```

2. Authenticate:
```bash
wrangler login
```

3. Create KV namespace:
```bash
wrangler kv namespace create CACHE_KV
```

4. Put returned KV `id` into `worker/wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "CACHE_KV"
id = "YOUR_KV_ID"
```

5. Set secret for FMP:
```bash
wrangler secret put FMP_API_KEY
```

6. Configure vars in `worker/wrangler.toml`:
```toml
[vars]
DAILY_NEW_TICKER_CAP = "120"
SEC_USER_AGENT = "ValueCheck/1.0 (contact:you@example.com)"
```

7. Deploy:
```bash
wrangler deploy
```

## Troubleshooting

- `Daily ticker cap reached`
  - Cause: free-tier new-ticker daily cap exceeded.
  - Fix: wait for next day reset or rely on already cached tickers.

- `FMP error 402 / 403`
  - Cause: plan/endpoint mismatch at FMP.
  - Fix: keep to supported endpoints or update FMP plan/key.

- `CIK not found for ticker`
  - Cause: ticker not present or not mapped in SEC list.
  - Fix: try primary US ticker format (example: `BRK.B` instead of unsupported variants).

- Empty or stale fields
  - Cause: missing SEC tags for that issuer/period or stale fallback cache.
  - Behavior: app shows `No data` instead of forcing a fail.

## Repo Layout

- `index.html` - app shell and route containers.
- `app.js` - routing, API calls, rendering logic.
- `styles.css` - theme and responsive UI.
- `worker/worker.js` - API aggregation, metrics, caching.
- `worker/wrangler.toml` - Worker config + bindings.
- `docs/` - product and UX reference docs.

## Disclaimer

This project is for educational and informational use only.
It is not investment advice and does not recommend buying or selling securities.
Always do your own due diligence.
