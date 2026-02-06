const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_NEW_TICKER_CAP = 25;

const SEC_TICKER_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_FACTS_BASE = "https://data.sec.gov/api/xbrl/companyfacts";
const FMP_QUOTE_URL = "https://financialmodelingprep.com/stable/quote";

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

const ANNUAL_FORMS = new Set(["10-K", "10-K/A", "20-F", "40-F"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/trending") {
      return handleTrending(env);
    }

    if (url.pathname === "/search") {
      const query = url.searchParams.get("q") || "";
      return handleSearch(query, env);
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

async function handleSearch(rawQuery, env) {
  const query = rawQuery.trim().toLowerCase();
  if (query.length < 2) {
    return jsonResponse({ query, results: [] });
  }

  const index = await getTickerIndex(env);
  const results = [];

  for (const item of index.list) {
    const ticker = item.ticker;
    const title = item.title || "";
    const tickerLower = ticker.toLowerCase();
    const titleLower = title.toLowerCase();
    let score = 0;

    if (tickerLower === query) score = 100;
    else if (tickerLower.startsWith(query)) score = 80;
    else if (titleLower.startsWith(query)) score = 60;
    else if (titleLower.includes(` ${query}`)) score = 40;
    else if (titleLower.includes(query)) score = 20;

    if (score > 0) {
      results.push({ ...item, score });
    }
    if (results.length > 200) break;
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.title || "").length - (b.title || "").length;
  });

  return jsonResponse({ query, results: results.slice(0, 10) });
}

async function fetchStockData(ticker, env) {
  const cik = await lookupCik(ticker, env);
  if (!cik) {
    throw new Error("CIK not found for ticker");
  }

  const facts = await secFetchJson(`${SEC_FACTS_BASE}/CIK${cik}.json`, env);
  const usGaap = facts?.facts?.["us-gaap"] || {};

  const revenueSeries = firstSeries(usGaap, [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "SalesRevenueNet",
  ]);
  const grossProfitSeries = getAnnualSeries(usGaap, "GrossProfit");
  const netIncomeSeries = getAnnualSeries(usGaap, "NetIncomeLoss");
  const sgaSeries = getAnnualSeries(usGaap, "SellingGeneralAndAdministrativeExpense");
  const rdSeries = getAnnualSeries(usGaap, "ResearchAndDevelopmentExpense");
  const ebitSeries = firstSeries(usGaap, [
    "OperatingIncomeLoss",
    "EarningsBeforeInterestAndTaxes",
  ]);
  const interestSeries = firstSeries(usGaap, [
    "InterestExpense",
    "InterestExpenseDebt",
  ]);

  const assetsSeries = getAnnualSeries(usGaap, "Assets");
  const liabilitiesSeries = getAnnualSeries(usGaap, "Liabilities");
  const equitySeries = firstSeries(usGaap, [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
  ]);
  const currentAssetsSeries = getAnnualSeries(usGaap, "AssetsCurrent");
  const currentLiabilitiesSeries = getAnnualSeries(usGaap, "LiabilitiesCurrent");
  const retainedSeries = getAnnualSeries(usGaap, "RetainedEarningsAccumulatedDeficit");

  const longDebtSeries = firstSeries(usGaap, [
    "LongTermDebt",
    "LongTermDebtNoncurrent",
    "LongTermDebtAndCapitalLeaseObligations",
  ]);
  const shortDebtSeries = firstSeries(usGaap, [
    "DebtCurrent",
    "LongTermDebtCurrent",
  ]);

  const operatingCashFlowSeries = getAnnualSeries(
    usGaap,
    "NetCashProvidedByUsedInOperatingActivities"
  );
  const capexSeries = firstSeries(usGaap, [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "CapitalExpenditures",
  ]);
  const dividendsSeries = firstSeries(usGaap, [
    "PaymentsOfDividends",
    "PaymentsOfDividendsCommonStock",
  ]);
  const repurchaseSeries = firstSeries(usGaap, [
    "RepurchaseOfCommonStock",
    "PaymentsForRepurchaseOfCommonStock",
  ]);

  const shares = getLatestFact(usGaap, "EntityCommonStockSharesOutstanding", "shares");

  const revenue = latestValue(revenueSeries);
  const grossProfit = latestValue(grossProfitSeries);
  const netIncome = latestValue(netIncomeSeries);
  const sga = latestValue(sgaSeries);
  const rd = latestValue(rdSeries);
  const ebit = latestValue(ebitSeries);
  const interestExpense = latestValue(interestSeries);

  const totalAssets = latestValue(assetsSeries);
  const totalLiabilities = latestValue(liabilitiesSeries);
  const totalEquity = latestValue(equitySeries);
  const currentAssets = latestValue(currentAssetsSeries);
  const currentLiabilities = latestValue(currentLiabilitiesSeries);
  const retainedEarnings = latestValue(retainedSeries);
  const longDebt = latestValue(longDebtSeries);
  const shortDebt = latestValue(shortDebtSeries);

  const operatingCashFlow = latestValue(operatingCashFlowSeries);
  const capex = latestValue(capexSeries);
  const dividendsPaid = latestValue(dividendsSeries);
  const shareRepurchases = latestValue(repurchaseSeries);

  const grossMargin = revenue && grossProfit ? toPercent(grossProfit / revenue) : null;
  const netMargin = revenue && netIncome ? toPercent(netIncome / revenue) : null;
  const sgaEfficiency = revenue && sga ? toPercent(sga / revenue) : null;
  const rdReliance = revenue && rd ? toPercent(rd / revenue) : null;
  const interestCoverage = ebit && interestExpense ? toRatio(Math.abs(ebit) / Math.abs(interestExpense)) : null;
  const totalDebt = sumNumbers(longDebt, shortDebt);
  const debtToEquity = totalDebt && totalEquity ? toRatio(totalDebt / totalEquity) : null;
  const roe = netIncome && totalEquity ? toPercent(netIncome / totalEquity) : null;
  const capexEfficiency = operatingCashFlow && capex ? toPercent(Math.abs(capex) / Math.abs(operatingCashFlow)) : null;

  const yearsAvailable = netIncomeSeries.length;
  const profitableYears = netIncomeSeries.filter((row) => toNumber(row.val) > 0).length;

  const freeCashFlow =
    operatingCashFlow !== null && capex !== null
      ? operatingCashFlow - Math.abs(capex)
      : null;

  const workingCapital =
    currentAssets !== null && currentLiabilities !== null
      ? currentAssets - currentLiabilities
      : null;

  const marketPrice = await fetchQuotePrice(ticker, env);
  const marketCap = marketPrice !== null && shares ? marketPrice * shares : null;

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
      ? toPercent((Math.abs(dividendsPaid || 0) + Math.abs(shareRepurchases || 0)) / marketCap)
      : null;

  const dcfLow = computeDCF({
    freeCashFlow,
    sharesOutstanding: shares,
    growthRate: 0.02,
    discountRate: 0.12,
    terminalGrowth: 0.02,
  });
  const dcfBase = computeDCF({
    freeCashFlow,
    sharesOutstanding: shares,
    growthRate: 0.05,
    discountRate: 0.1,
    terminalGrowth: 0.02,
  });
  const dcfHigh = computeDCF({
    freeCashFlow,
    sharesOutstanding: shares,
    growthRate: 0.08,
    discountRate: 0.08,
    terminalGrowth: 0.025,
  });

  let growthRate = null;
  if (netIncomeSeries.length >= 2) {
    const start = toNumber(netIncomeSeries[netIncomeSeries.length - 1].val);
    const end = toNumber(netIncomeSeries[0].val);
    if (start && end && start > 0) {
      const years = netIncomeSeries.length - 1;
      growthRate = Math.pow(end / start, 1 / years) - 1;
    }
  }

  const eps = netIncome && shares ? netIncome / shares : null;
  const graham = eps ? eps * (8.5 + 2 * ((growthRate ?? 0.05) * 100)) : null;
  const lynch = eps && growthRate ? eps * (growthRate * 100) : null;

  const impliedGrowth = impliedGrowthRate({
    freeCashFlow,
    sharesOutstanding: shares,
    price: marketPrice,
    discountRate: 0.1,
    terminalGrowth: 0.02,
  });

  return {
    ticker,
    name: facts?.entityName || ticker,
    price: marketPrice,
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
      current: marketPrice,
    },
  };
}

async function lookupCik(ticker, env) {
  const index = await getTickerIndex(env);
  const map = index.map;

  const raw = ticker.toUpperCase();
  const direct = map[raw];
  if (direct) return padCik(direct);

  const alt = raw.includes(".") ? raw.replace(".", "-") : raw.replace("-", ".");
  const altCik = map[alt];
  if (altCik) return padCik(altCik);

  return null;
}

async function getTickerIndex(env) {
  const cached = await getCache(env, "sec:tickers:index", true);
  if (cached) return cached;

  const data = await secFetchJson(SEC_TICKER_URL, env);
  const map = {};
  const list = [];
  for (const key of Object.keys(data || {})) {
    const row = data[key];
    if (row && row.ticker && row.cik_str) {
      const ticker = String(row.ticker).toUpperCase();
      map[ticker] = row.cik_str;
      list.push({
        ticker,
        title: row.title || "",
        cik: row.cik_str,
      });
    }
  }

  const payload = { map, list };
  await putCache(env, "sec:tickers:index", payload);
  return payload;
}

async function secFetchJson(url, env) {
  const userAgent =
    env.SEC_USER_AGENT || "ValueCheck/1.0 (contact: support@valuecheck.local)";
  const res = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      "Accept-Encoding": "gzip, deflate",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SEC error ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchQuotePrice(ticker, env) {
  const key = env.FMP_API_KEY || "";
  if (!key) return null;

  const url = new URL(FMP_QUOTE_URL);
  url.search = new URLSearchParams({ symbol: ticker, apikey: key }).toString();

  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) return null;
  const quote = data[0];
  if (quote && typeof quote.price === "number") return quote.price;
  return null;
}

function getAnnualSeries(usGaap, tag, unit = "USD") {
  const fact = usGaap?.[tag];
  const items = fact?.units?.[unit] || [];
  const annual = items.filter(
    (item) =>
      item.form &&
      ANNUAL_FORMS.has(item.form) &&
      (item.fp === "FY" || item.fp === "FYI" || !item.fp)
  );

  const byYear = new Map();
  for (const item of annual) {
    const year = item.fy || (item.end ? Number(item.end.slice(0, 4)) : null);
    if (!year) continue;
    const existing = byYear.get(year);
    if (!existing || (item.end && existing.end && item.end > existing.end)) {
      byYear.set(year, item);
    } else if (!existing) {
      byYear.set(year, item);
    }
  }

  return Array.from(byYear.values()).sort((a, b) => (b.fy || 0) - (a.fy || 0));
}

function firstSeries(usGaap, tags, unit = "USD") {
  for (const tag of tags) {
    const series = getAnnualSeries(usGaap, tag, unit);
    if (series.length) return series;
  }
  return [];
}

function getLatestFact(usGaap, tag, unit) {
  const fact = usGaap?.[tag];
  const items = fact?.units?.[unit] || [];
  const filtered = items.filter((item) => item.end && item.form && ANNUAL_FORMS.has(item.form));
  filtered.sort((a, b) => (a.end < b.end ? 1 : -1));
  return filtered.length ? toNumber(filtered[0].val) : null;
}

function latestValue(series) {
  if (!series || !series.length) return null;
  return toNumber(series[0].val);
}

function padCik(value) {
  return String(value).padStart(10, "0");
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

function sumNumbers(a, b) {
  if (a === null && b === null) return null;
  return (a || 0) + (b || 0);
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
