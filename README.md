# Value Check

Static MVP for a value-investing web app. Designed for GitHub Pages and free-tier data constraints.

## Live
Check it here:
- https://piyushhhhh.github.io/value-investing/

## Run locally
Open `index.html` directly or serve the folder with a static server.

## Configure API
## Cloudflare Worker (Free Plan)
Use the Worker in `worker/` as the backend (no Firebase Functions required).

### Setup
1. Install Wrangler: `npm install -g wrangler`
2. Create a KV namespace:
   - `wrangler kv namespace create CACHE_KV`
3. Update `worker/wrangler.toml` with the KV `id`
4. Set the FMP key as a secret:
   - `wrangler secret put FMP_API_KEY`
5. Deploy:
   - `wrangler deploy worker/worker.js`

### Frontend config
The current Worker URL is:
`https://value-check.value-check.workers.dev`

The frontend is configured to use this URL in `index.html`.

If it changes, set the API base in `index.html` before `app.js`:
```html
<script>
  window.VALUE_CHECK_API_BASE = "https://YOUR_WORKER_URL";
</script>
```

```html
<script>
  window.VALUE_CHECK_API_BASE = "https://YOUR_FUNCTIONS_DOMAIN/api";
</script>
```

## Firebase Functions (Not Used on Free Plan)
Firebase Functions require the Blaze plan. If you upgrade later, the Functions
code is in `functions/`.

## Routes
Uses hash routes for GitHub Pages:
- `#/analyzer/BRK.B`
- `#/valuation/BRK.B`
- `#/memo/BRK.B`
- `#/snapshot/BRK.B`
