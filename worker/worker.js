const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_NEW_TICKER_CAP = 25;

const TRENDING = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "NVDA",
  "BRK.B",
  "META",
  "TSLA",
  "UNH",
  "JPM",
  "V",
  "XOM",
  "AVGO",
  "MA",
  "LLY",
  "WMT",
  "COST",
  "HD",
  "KO",
  "PEP",
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/trending") {
      return handleTrending(env);
    }

    if (url.pathname.startsWith("/stock/")) {
      const ticker = url.pathname.replace("/stock/", "").trim();
      return handleStock(ticker, env);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders() });
  },
};

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

async function handleTrending(env) {
  const cached = await getCache(env, "trending");
  if (cached) return jsonResponse(cached);

  const payload = {
    tickers: TRENDING,
    lastUpdated: todayKey(),
  };
  await putCache(env, "trending", payload);
  return jsonResponse(payload);
}

async function handleStock(rawTicker, env) {
  if (!rawTicker) return jsonResponse({ error: "Ticker required" }, 400);
  const ticker = rawTicker.toUpperCase();
  const cacheKey = `stock:${ticker}`;
  const cached = await getCache(env, cacheKey);
  if (cached) return jsonResponse(cached);

  const cap = Number(env.DAILY_NEW_TICKER_CAP || DEFAULT_DAILY_NEW_TICKER_CAP);
  const allowed = await checkDailyCap(env, ticker, cap);
  if (!allowed) {
    return jsonResponse({ error: "Daily ticker cap reached" }, 429);
  }

  try {
    const payload = await fetchStockData(ticker, env);
    await putCache(env, cacheKey, payload);
    return jsonResponse(payload);
  } catch (err) {
    const stale = await getCache(env, cacheKey, true);
    if (stale) {
      return jsonResponse(stale, 200, { "x-cache": "stale" });
    }
    return jsonResponse({ error: err.message || "Unable to fetch data" }, 500);
  }
}

async function fetchStockData(ticker, env) {
  const normalized = ticker.includes(".") ? ticker.replace(".", "-") : ticker;
  const profile = await fmpFetch("/profile", { symbol: normalized }, env);
  const income = await fmpFetch(
    "/income-statement",
    { symbol: normalized, period: "annual", limit: 10 },
    env
  );
  const balance = await fmpFetch(
    "/balance-sheet-statement",
    { symbol: normalized, period: "annual", limit: 10 },
    env
  );
  const cashflow = await fmpFetch(
    "/cash-flow-statement",
    { symbol: normalized, period: "annual", limit: 10 },
    env
  );

  const company = profile?.[0] || {};
  const incomeLatest = income?.[0] || {};
  const balanceLatest = balance?.[0] || {};
  const cashLatest = cashflow?.[0] || {};

  const revenue = toNumber(incomeLatest.revenue);
  const grossProfit = toNumber(incomeLatest.grossProfit);
  const netIncome = toNumber(incomeLatest.netIncome);
  const sga = toNumber(
    incomeLatest.sellingGeneralAndAdministrativeExpenses ?? incomeLatest.sgaExpense
  );
  const rd = toNumber(
    incomeLatest.researchAndDevelopmentExpenses ?? incomeLatest.researchAndDevelopment
  );
  const ebit = toNumber(incomeLatest.ebit ?? incomeLatest.operatingIncome);
  const interestExpense = Math.abs(toNumber(incomeLatest.interestExpense)) || null;

  const shortDebt = toNumber(balanceLatest.shortTermDebt);
  const longDebt = toNumber(balanceLatest.longTermDebt);
  let totalDebt = toNumber(balanceLatest.totalDebt);
  if (totalDebt === null) {
    const parts = [shortDebt, longDebt].filter((v) => v !== null);
    totalDebt = parts.length ? parts.reduce((sum, v) => sum + v, 0) : null;
  }

  const totalEquity = toNumber(balanceLatest.totalStockholdersEquity);
  const totalAssets = toNumber(balanceLatest.totalAssets);
  const totalLiabilities = toNumber(balanceLatest.totalLiabilities);
  const currentAssets = toNumber(balanceLatest.totalCurrentAssets);
  const currentLiabilities = toNumber(balanceLatest.totalCurrentLiabilities);
  const retainedEarnings = toNumber(balanceLatest.retainedEarnings);

  const operatingCashFlow = toNumber(cashLatest.operatingCashFlow);
  const capexRaw = toNumber(cashLatest.capitalExpenditure);
  const capex = capexRaw === null ? null : Math.abs(capexRaw);
  const dividendsRaw = toNumber(cashLatest.dividendsPaid);
  const dividendsPaid = dividendsRaw === null ? null : Math.abs(dividendsRaw);
  const repurchaseRaw = toNumber(cashLatest.commonStockRepurchased);
  const shareRepurchases = repurchaseRaw === null ? null : Math.abs(repurchaseRaw);

  const price = toNumber(company.price);
  const sharesOutstanding = toNumber(company.sharesOutstanding);
  const marketCap = toNumber(company.mktCap);

  const grossMargin = revenue && grossProfit ? toPercent(grossProfit / revenue) : null;
  const netMargin = revenue && netIncome ? toPercent(netIncome / revenue) : null;
  const sgaEfficiency = revenue && sga ? toPercent(sga / revenue) : null;
  const rdReliance = revenue && rd ? toPercent(rd / revenue) : null;
  const interestCoverage = ebit && interestExpense ? toRatio(ebit / interestExpense) : null;
  const debtToEquity = totalDebt && totalEquity ? toRatio(totalDebt / totalEquity) : null;
  const roe = netIncome && totalEquity ? toPercent(netIncome / totalEquity) : null;
  const capexEfficiency = operatingCashFlow && capex ? toPercent(capex / operatingCashFlow) : null;

  const earningsHistory = (income || []).slice(0, 10);
  const yearsAvailable = earningsHistory.length;
  const profitableYears = earningsHistory.filter((row) => toNumber(row.netIncome) > 0).length;

  const freeCashFlow = operatingCashFlow !== null && capex !== null ? operatingCashFlow - capex : null;

  const workingCapital =
    currentAssets !== null && currentLiabilities !== null
      ? currentAssets - currentLiabilities
      : null;

  const altmanZ = computeAltmanZ({
    workingCapital,
    retainedEarnings,
    ebit,
    marketValueEquity: marketCap,
    totalLiabilities,
    sales: revenue,
    totalAssets,
  });

  const shareholderYield =
    marketCap && (dividendsPaid || shareRepurchases)
      ? toPercent((dividendsPaid + (shareRepurchases || 0)) / marketCap)
      : null;

  const dcfLow = computeDCF({
    freeCashFlow,
    sharesOutstanding,
    growthRate: 0.02,
    discountRate: 0.12,
    terminalGrowth: 0.02,
  });
  const dcfBase = computeDCF({
    freeCashFlow,
    sharesOutstanding,
    growthRate: 0.05,
    discountRate: 0.1,
    terminalGrowth: 0.02,
  });
  const dcfHigh = computeDCF({
    freeCashFlow,
    sharesOutstanding,
    growthRate: 0.08,
    discountRate: 0.08,
    terminalGrowth: 0.025,
  });

  let growthRate = null;
  if (earningsHistory.length >= 2) {
    const start = toNumber(earningsHistory[earningsHistory.length - 1].netIncome);
    const end = toNumber(earningsHistory[0].netIncome);
    if (start && end && start > 0) {
      const years = earningsHistory.length - 1;
      growthRate = Math.pow(end / start, 1 / years) - 1;
    }
  }

  const eps = netIncome && sharesOutstanding ? netIncome / sharesOutstanding : null;
  const graham = eps ? eps * (8.5 + 2 * ((growthRate ?? 0.05) * 100)) : null;
  const lynch = eps && growthRate ? eps * (growthRate * 100) : null;

  const impliedGrowth = impliedGrowthRate({
    freeCashFlow,
    sharesOutstanding,
    price,
    discountRate: 0.1,
    terminalGrowth: 0.02,
  });

  return {
    ticker,
    name: company.companyName || ticker,
    price,
    lastUpdated: todayKey(),
    metrics: {
      grossMargin,
      sgaEfficiency,
      rdReliance,
      netMargin,
      consistentEarnings: profitableYears,
      consistentEarningsYears: yearsAvailable,
      interestCoverage,
      debtToEquity,
      roe,
      capexEfficiency,
      dollarTest: null,
    },
    snapshots: {
      shareholderYield,
      solvency: solvencyLabel(altmanZ),
      altmanZ,
    },
    valuation: {
      dcf: {
        low: dcfLow,
        base: dcfBase,
        high: dcfHigh,
      },
      graham,
      lynch,
      impliedGrowth,
      current: price,
    },
  };
}

async function fmpFetch(path, params, env) {
  const key = env.FMP_API_KEY || "";
  if (!key) {
    throw new Error("FMP API key missing. Set FMP_API_KEY in Worker secrets.");
  }

  const url = new URL(`https://financialmodelingprep.com/stable${path}`);
  url.search = new URLSearchParams({ apikey: key, ...params }).toString();

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FMP error ${res.status}: ${text}`);
  }
  return res.json();
}

async function getCache(env, key, allowStale = false) {
  const raw = await env.CACHE_KV.get(`cache:${key}`, "json");
  if (!raw || !raw.updatedAt) return null;
  const age = Date.now() - raw.updatedAt;
  if (age <= CACHE_TTL_MS) return raw.payload;
  if (allowStale && age <= STALE_TTL_MS) return raw.payload;
  return null;
}

async function putCache(env, key, payload) {
  const record = { payload, updatedAt: Date.now() };
  await env.CACHE_KV.put(`cache:${key}`, JSON.stringify(record), {
    expirationTtl: Math.floor(STALE_TTL_MS / 1000),
  });
}

async function checkDailyCap(env, ticker, cap) {
  const today = todayKey();
  const usageKey = `usage:${today}`;
  const raw = await env.CACHE_KV.get(usageKey, "json");
  const usage = raw || { count: 0, tickers: [] };

  if (!usage.tickers.includes(ticker)) {
    if (usage.count >= cap) return false;
    usage.tickers.push(ticker);
    usage.count += 1;
    await env.CACHE_KV.put(usageKey, JSON.stringify(usage), {
      expirationTtl: 2 * 24 * 60 * 60,
    });
  }

  return true;
}

function toNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value);
}

function toPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number((value * 100).toFixed(1));
}

function toRatio(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value.toFixed(2));
}

function computeAltmanZ({
  workingCapital,
  retainedEarnings,
  ebit,
  marketValueEquity,
  totalLiabilities,
  sales,
  totalAssets,
}) {
  if (
    [
      workingCapital,
      retainedEarnings,
      ebit,
      marketValueEquity,
      totalLiabilities,
      sales,
      totalAssets,
    ].some((v) => v === null || v === undefined || totalAssets === 0 || totalLiabilities === 0)
  ) {
    return null;
  }

  const z =
    1.2 * (workingCapital / totalAssets) +
    1.4 * (retainedEarnings / totalAssets) +
    3.3 * (ebit / totalAssets) +
    0.6 * (marketValueEquity / totalLiabilities) +
    1.0 * (sales / totalAssets);

  return Number(z.toFixed(2));
}

function solvencyLabel(z) {
  if (z === null || z === undefined) return "Unknown";
  if (z >= 3) return "Safe";
  if (z >= 1.8) return "Caution";
  return "Risk";
}

function computeDCF({
  freeCashFlow,
  sharesOutstanding,
  growthRate,
  discountRate,
  terminalGrowth,
}) {
  if (!freeCashFlow || !sharesOutstanding) return null;
  let cash = freeCashFlow;
  let present = 0;
  for (let year = 1; year <= 10; year += 1) {
    cash *= 1 + growthRate;
    present += cash / Math.pow(1 + discountRate, year);
  }
  const terminal =
    (cash * (1 + terminalGrowth)) / (discountRate - terminalGrowth);
  present += terminal / Math.pow(1 + discountRate, 10);
  return present / sharesOutstanding;
}

function impliedGrowthRate({
  freeCashFlow,
  sharesOutstanding,
  price,
  discountRate,
  terminalGrowth,
}) {
  if (!freeCashFlow || !sharesOutstanding || !price) return null;
  let low = -0.05;
  let high = 0.3;
  for (let i = 0; i < 30; i += 1) {
    const mid = (low + high) / 2;
    const value = computeDCF({
      freeCashFlow,
      sharesOutstanding,
      growthRate: mid,
      discountRate,
      terminalGrowth,
    });
    if (!value) return null;
    if (value > price) {
      high = mid;
    } else {
      low = mid;
    }
  }
  return Number(((low + high) / 2 * 100).toFixed(1));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
