# Value Check

Value Check is a static, GitHub Pages friendly value‑investing app backed by a free‑tier Cloudflare Worker. It pulls fundamentals from the SEC XBRL API and price quotes from FMP, then turns them into a simple checklist, score, and compare view.

## Live
Check it here:
- https://piyushhhhh.github.io/value-investing/

## What it does
- Analyze a single stock with 10 value signals.
- Show a score and verdict based on available signals.
- Provide snapshot metrics (price, market cap, shareholder yield, Altman Z‑score).
- Compare two stocks side‑by‑side with winners highlighted.
- No login required, works on a static host.

## Data sources
- **SEC XBRL API** for fundamentals (income statement, balance sheet, cash flow).
- **FMP `/quote`** for live price and market cap.

## How it works
- The frontend is a static single‑page app served from GitHub Pages.
- The backend is a Cloudflare Worker in `worker/` with KV caching.
- The app uses hash routes so it works on static hosting.

## Run locally
Open `index.html` directly or serve the folder with a static server.

## Configure API
### Cloudflare Worker (Free Plan)
Use the Worker in `worker/` as the backend.

### Setup
1. Install Wrangler: `npm install -g wrangler`
2. Create a KV namespace: `wrangler kv namespace create CACHE_KV`
3. Update `worker/wrangler.toml` with the KV `id` from step 2.
4. Set the FMP key (used for quotes only): `wrangler secret put FMP_API_KEY`
5. Update `SEC_USER_AGENT` in `worker/wrangler.toml` with your contact email.
6. Deploy: `wrangler deploy worker/worker.js`

### Frontend config
The current Worker URL is:
`https://value-check.value-check.workers.dev`

If it changes, set the API base in `index.html` before `app.js`:
```html
<script>
  window.VALUE_CHECK_API_BASE = "https://YOUR_WORKER_URL";
</script>
```

## Routes
Uses hash routes for GitHub Pages:
- `#/analyzer/BRK.B`
- `#/compare/AAPL/GOOGL`
- `#/valuation/BRK.B`
- `#/memo/BRK.B`
- `#/snapshot/BRK.B`

## Compare
The compare page accepts two tickers or company names and renders a head‑to‑head table with winners highlighted per metric.

## Scoring rules
- A signal only counts if the underlying data exists.
- Missing values show “No data” and do not count as a fail.
- The score is based on the number of available signals.

## Limitations
- US stocks only (based on SEC coverage).
- FMP free tier has daily request caps.
- SEC endpoints are rate‑limited, so caching is required for stability.

## Repo structure
- `index.html`, `app.js`, `styles.css` for the frontend.
- `worker/worker.js` and `worker/wrangler.toml` for the API layer.
