const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

admin.initializeApp();
const db = admin.firestore();

const FMP_BASE = "https://financialmodelingprep.com/stable";
const KEY_CACHE_MS = 6 * 60 * 60 * 1000;
let cachedKey = null;
let cachedKeyAt = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DAILY_NEW_TICKER_CAP = 25;
const STOCK_CACHE_VERSION = "v2";

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

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

function nowMs() {
  return Date.now();
}

function todayKey() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

async function getFmpKey() {
  const direct =
    process.env.FMP_API_KEY ||
    process.env.FMP_KEY ||
    functions.config?.().fmp?.api_key ||
    "";
  if (direct) return direct;

  const now = nowMs();
  if (cachedKey && now - cachedKeyAt < KEY_CACHE_MS) return cachedKey;

  const doc = await db.collection("config").doc("fmp").get();
  if (doc.exists) {
    const data = doc.data() || {};
    const key = data.apiKey || data.key || "";
    if (key) {
      cachedKey = key;
      cachedKeyAt = now;
      return key;
    }
  }
  return "";
}

async function fmpFetch(path, params = {}) {
  const key = await getFmpKey();

  if (!key) {
    throw new Error("FMP API key missing. Set FMP_API_KEY env var.");
  }

  const url = new URL(`${FMP_BASE}${path}`);
  const search = new URLSearchParams({ apikey: key, ...params });
  url.search = search.toString();
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FMP error ${res.status}: ${text}`);
  }
  return res.json();
}

function safeNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value);
}

function percent(num) {
  if (num === null || num === undefined || Number.isNaN(num)) return null;
  return Number((num * 100).toFixed(1));
}

function ratio(num) {
  if (num === null || num === undefined || Number.isNaN(num)) return null;
  return Number(num.toFixed(2));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeGrowthRate(rawRate, { fallback = 0.05, min = 0, max = 0.15 } = {}) {
  if (rawRate === null || rawRate === undefined || Number.isNaN(rawRate)) return fallback;
  return clamp(rawRate, min, max);
}

function computeGrahamFairValue({ eps, growthRate, currentPrice }) {
  if (!eps || eps <= 0) return null;
  const normalizedGrowth = normalizeGrowthRate(growthRate, { fallback: 0.05, min: 0, max: 0.15 });
  const multiplier = 8.5 + 2 * (normalizedGrowth * 100);
  const fairValue = eps * multiplier;
  if (!Number.isFinite(fairValue) || fairValue <= 0) return null;
  if (currentPrice && fairValue > currentPrice * 6) return null;
  return Number(fairValue.toFixed(2));
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

async function loadFromCache(collection, key) {
  const doc = await db.collection(collection).doc(key).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (!data || !data.updatedAt) return null;
  const age = nowMs() - data.updatedAt.toMillis();
  if (age > CACHE_TTL_MS) return null;
  return data.payload;
}

async function writeCache(collection, key, payload) {
  await db.collection(collection).doc(key).set({
    payload,
    updatedAt: admin.firestore.Timestamp.now(),
  });
}

async function incrementDailyUsage(ticker) {
  const key = todayKey();
  const ref = db.collection("fmp_usage").doc(key);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : { count: 0, tickers: [] };
    const tickers = new Set(data.tickers || []);

    if (!tickers.has(ticker)) {
      if (data.count >= DAILY_NEW_TICKER_CAP) {
        throw new Error("Daily ticker cap reached");
      }
      tickers.add(ticker);
      tx.set(ref, { count: data.count + 1, tickers: Array.from(tickers) }, { merge: true });
    }
  });
}

async function fetchStockData(ticker) {
  const profile = await fmpFetch(`/profile`, { symbol: ticker });
  const income = await fmpFetch(`/income-statement`, { symbol: ticker, period: "annual", limit: 10 });
  const balance = await fmpFetch(`/balance-sheet-statement`, { symbol: ticker, period: "annual", limit: 10 });
  const cashflow = await fmpFetch(`/cash-flow-statement`, { symbol: ticker, period: "annual", limit: 10 });

  const company = profile?.[0] || {};
  const incomeLatest = income?.[0] || {};
  const balanceLatest = balance?.[0] || {};
  const cashLatest = cashflow?.[0] || {};

  const revenue = safeNumber(incomeLatest.revenue);
  const grossProfit = safeNumber(incomeLatest.grossProfit);
  const netIncome = safeNumber(incomeLatest.netIncome);
  const sga = safeNumber(
    incomeLatest.sellingGeneralAndAdministrativeExpenses ?? incomeLatest.sgaExpense
  );
  const rd = safeNumber(
    incomeLatest.researchAndDevelopmentExpenses ?? incomeLatest.researchAndDevelopment
  );
  const ebit = safeNumber(incomeLatest.ebit ?? incomeLatest.operatingIncome);
  const interestExpense = Math.abs(safeNumber(incomeLatest.interestExpense)) || null;

  const shortDebt = safeNumber(balanceLatest.shortTermDebt);
  const longDebt = safeNumber(balanceLatest.longTermDebt);
  let totalDebt = safeNumber(balanceLatest.totalDebt);
  if (totalDebt === null) {
    const parts = [shortDebt, longDebt].filter((v) => v !== null);
    totalDebt = parts.length ? parts.reduce((sum, v) => sum + v, 0) : null;
  }
  const totalEquity = safeNumber(balanceLatest.totalStockholdersEquity);
  const totalAssets = safeNumber(balanceLatest.totalAssets);
  const totalLiabilities = safeNumber(balanceLatest.totalLiabilities);
  const currentAssets = safeNumber(balanceLatest.totalCurrentAssets);
  const currentLiabilities = safeNumber(balanceLatest.totalCurrentLiabilities);
  const retainedEarnings = safeNumber(balanceLatest.retainedEarnings);

  const operatingCashFlow = safeNumber(cashLatest.operatingCashFlow);
  const capexRaw = safeNumber(cashLatest.capitalExpenditure);
  const capex = capexRaw === null ? null : Math.abs(capexRaw);
  const dividendsRaw = safeNumber(cashLatest.dividendsPaid);
  const dividendsPaid = dividendsRaw === null ? null : Math.abs(dividendsRaw);
  const repurchaseRaw = safeNumber(cashLatest.commonStockRepurchased);
  const shareRepurchases = repurchaseRaw === null ? null : Math.abs(repurchaseRaw);

  const price = safeNumber(company.price);
  const sharesOutstanding = safeNumber(company.sharesOutstanding);
  const marketCap = safeNumber(company.mktCap);

  const grossMargin = revenue && grossProfit ? percent(grossProfit / revenue) : null;
  const netMargin = revenue && netIncome ? percent(netIncome / revenue) : null;
  const sgaEfficiency = revenue && sga ? percent(sga / revenue) : null;
  const rdReliance = revenue && rd ? percent(rd / revenue) : null;
  const interestCoverage = ebit && interestExpense ? ratio(ebit / interestExpense) : null;
  const debtToEquity = totalDebt && totalEquity ? ratio(totalDebt / totalEquity) : null;
  const roe = netIncome && totalEquity ? percent(netIncome / totalEquity) : null;
  const capexEfficiency = operatingCashFlow && capex ? percent(capex / operatingCashFlow) : null;

  const earningsHistory = (income || []).slice(0, 10);
  const yearsAvailable = earningsHistory.length;
  const profitableYears = earningsHistory.filter((row) => safeNumber(row.netIncome) > 0).length;

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
      ? percent((dividendsPaid + (shareRepurchases || 0)) / marketCap)
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
    const start = safeNumber(earningsHistory[earningsHistory.length - 1].netIncome);
    const end = safeNumber(earningsHistory[0].netIncome);
    if (start && end && start > 0) {
      const years = earningsHistory.length - 1;
      growthRate = Math.pow(end / start, 1 / years) - 1;
    }
  }

  const trailingNetIncome = earningsHistory
    .slice(0, 3)
    .map((row) => safeNumber(row.netIncome))
    .filter((value) => value !== null && Number.isFinite(value) && value > 0);
  const normalizedNetIncome = trailingNetIncome.length >= 2 ? average(trailingNetIncome) : null;

  const eps = netIncome && sharesOutstanding ? netIncome / sharesOutstanding : null;
  const normalizedEps =
    normalizedNetIncome !== null && sharesOutstanding ? normalizedNetIncome / sharesOutstanding : null;
  const epsForValuation = normalizedEps ?? eps;

  const graham = computeGrahamFairValue({
    eps: epsForValuation,
    growthRate,
    currentPrice: price,
  });

  const lynchGrowth = normalizeGrowthRate(growthRate, {
    fallback: null,
    min: 0,
    max: 0.25,
  });
  const lynch =
    epsForValuation && lynchGrowth !== null
      ? Number((epsForValuation * (lynchGrowth * 100)).toFixed(2))
      : null;

  const impliedGrowth = impliedGrowthRate({
    freeCashFlow,
    sharesOutstanding,
    price,
    discountRate: 0.1,
    terminalGrowth: 0.02,
  });

  const payload = {
    ticker,
    name: company.companyName || ticker,
    price,
    lastUpdated: new Date().toISOString().slice(0, 10),
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

  return payload;
}

async function getStockPayload(ticker) {
  const normalizedTicker = ticker.toUpperCase();
  const cacheKey = `${STOCK_CACHE_VERSION}:${normalizedTicker}`;
  const cached = await loadFromCache("stock_cache", cacheKey);
  if (cached) return cached;

  const legacyCached = await loadFromCache("stock_cache", normalizedTicker);
  if (legacyCached) {
    await writeCache("stock_cache", cacheKey, legacyCached);
    return legacyCached;
  }

  await incrementDailyUsage(normalizedTicker);
  const payload = await fetchStockData(normalizedTicker);
  await writeCache("stock_cache", cacheKey, payload);
  return payload;
}

app.get("/stock/:ticker", async (req, res) => {
  try {
    let ticker = req.params.ticker.toUpperCase();
    let payload;
    try {
      payload = await getStockPayload(ticker);
    } catch (err) {
      if (ticker.includes(".")) {
        const alt = ticker.replace(".", "-");
        payload = await getStockPayload(alt);
        payload.ticker = ticker;
      } else {
        throw err;
      }
    }
    res.json(payload);
  } catch (err) {
    const message = err.message || "Unable to fetch data";
    const status = message.includes("cap") ? 429 : 500;
    res.status(status).json({ error: message });
  }
});

app.get("/trending", async (req, res) => {
  try {
    const cached = await loadFromCache("stock_cache", "TRENDING");
    if (cached) {
      res.json(cached);
      return;
    }

    const payload = {
      tickers: TRENDING,
      lastUpdated: new Date().toISOString().slice(0, 10),
    };
    await writeCache("stock_cache", "TRENDING", payload);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: "Unable to load trending" });
  }
});

exports.api = onRequest({
  region: "us-central1",
  timeoutSeconds: 60,
  memory: "256MiB",
}, app);

exports.refreshTrending = onSchedule(
  {
    schedule: "every day 06:00",
    timeZone: "America/New_York",
    region: "us-central1",
  },
  async () => {
    const payload = {
      tickers: TRENDING,
      lastUpdated: new Date().toISOString().slice(0, 10),
    };
    await writeCache("stock_cache", "TRENDING", payload);
  }
);
