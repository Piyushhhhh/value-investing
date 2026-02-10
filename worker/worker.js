const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_NEW_TICKER_CAP = 25;

const SEC_TICKER_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_FACTS_BASE = "https://data.sec.gov/api/xbrl/companyfacts";
const SEC_SUBMISSIONS_BASE = "https://data.sec.gov/submissions/CIK";
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
const QUARTERLY_FORMS = new Set(["10-Q", "10-Q/A"]);
const ALL_FORMS = new Set([...ANNUAL_FORMS, ...QUARTERLY_FORMS]);
const SIC_PEERS_TTL = 90 * 24 * 60 * 60;

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
      const period = normalizePeriod(url.searchParams.get("period"));
      return handleStock(ticker, env, period);
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

async function handleStock(rawTicker, env, period) {
  if (!rawTicker) return jsonResponse({ error: "Ticker required" }, 400);
  const ticker = rawTicker.toUpperCase();
  const cacheKey = `stock:${ticker}:${period}`;
  const cached = await getCache(env, cacheKey);
  if (cached) return jsonResponse(cached);

  const cap = Number(env.DAILY_NEW_TICKER_CAP || DEFAULT_DAILY_NEW_TICKER_CAP);
  const allowed = await checkDailyCap(env, ticker, cap);
  if (!allowed) {
    return jsonResponse({ error: "Daily ticker cap reached" }, 429);
  }

  try {
    const payload = await fetchStockData(ticker, env, period);
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

async function resolveTickerFromQuery(rawQuery, env) {
  const query = rawQuery.trim().toLowerCase();
  if (query.length < 2) return null;
  const index = await getTickerIndex(env);
  for (const item of index.list) {
    const tickerLower = item.ticker.toLowerCase();
    const titleLower = (item.title || "").toLowerCase();
    if (tickerLower === query) return item.ticker;
    if (tickerLower.startsWith(query)) return item.ticker;
    if (titleLower.startsWith(query)) return item.ticker;
    if (titleLower.includes(` ${query}`)) return item.ticker;
    if (titleLower.includes(query)) return item.ticker;
  }
  return null;
}

async function fetchStockData(ticker, env, period) {
  let resolvedTicker = ticker;
  let cik = await lookupCik(resolvedTicker, env);
  if (!cik) {
    const fallback = await resolveTickerFromQuery(ticker, env);
    if (fallback) {
      resolvedTicker = fallback;
      cik = await lookupCik(resolvedTicker, env);
    }
  }
  if (!cik) {
    throw new Error("CIK not found for ticker or company name");
  }

  const facts = await secFetchJson(`${SEC_FACTS_BASE}/CIK${cik}.json`, env);
  const submissions = await fetchSubmissions(cik, env);
  const sic = submissions?.sic ? String(submissions.sic) : null;
  const sicDescription = submissions?.sicDescription || null;
  const industry = sic && sicDescription ? `${sic} — ${sicDescription}` : sicDescription || null;
  const peers = await getPeersForSic(env, sic, resolvedTicker);
  const usGaap = facts?.facts?.["us-gaap"] || {};
  const dei = facts?.facts?.dei || {};

  const revenueSel = selectSeries(usGaap, [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "SalesRevenueNet",
  ], period);
  const grossProfitSel = selectSeries(usGaap, ["GrossProfit"], period);
  const netIncomeSel = selectSeries(usGaap, [
    "NetIncomeLoss",
    "ProfitLoss",
    "NetIncomeLossAvailableToCommonStockholdersBasic",
  ], period);
  const sgaSel = selectSeries(usGaap, ["SellingGeneralAndAdministrativeExpense"], period);
  const rdSel = selectSeries(usGaap, ["ResearchAndDevelopmentExpense"], period);
  const ebitSel = selectSeries(usGaap, [
    "OperatingIncomeLoss",
    "EarningsBeforeInterestAndTaxes",
    "OperatingIncomeLossContinuingOperations",
  ], period);
  const interestSel = selectSeries(usGaap, [
    "InterestExpense",
    "InterestExpenseDebt",
  ], period);

  const assetsSel = selectSeries(usGaap, ["Assets"], period);
  const liabilitiesSel = selectSeries(usGaap, ["Liabilities"], period);
  const equitySel = selectSeries(usGaap, [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
  ], period);
  const currentAssetsSel = selectSeries(usGaap, ["AssetsCurrent"], period);
  const currentLiabilitiesSel = selectSeries(usGaap, ["LiabilitiesCurrent"], period);
  const retainedSel = selectSeries(usGaap, ["RetainedEarningsAccumulatedDeficit"], period);

  const longDebtSel = selectSeries(usGaap, [
    "LongTermDebt",
    "LongTermDebtNoncurrent",
    "LongTermDebtAndCapitalLeaseObligations",
  ], period);
  const shortDebtSel = selectSeries(usGaap, [
    "DebtCurrent",
    "LongTermDebtCurrent",
  ], period);

  const operatingCashFlowSel = selectSeries(usGaap, [
    "NetCashProvidedByUsedInOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
  ], period);
  const capexSel = selectSeries(usGaap, [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsToAcquirePropertyPlantAndEquipmentNet",
    "PaymentsToAcquireProductiveAssets",
    "CapitalExpenditures",
  ], period);
  const dividendsSel = selectSeries(usGaap, [
    "PaymentsOfDividends",
    "PaymentsOfDividendsCommonStock",
  ], period);
  const repurchaseSel = selectSeries(usGaap, [
    "RepurchaseOfCommonStock",
    "PaymentsForRepurchaseOfCommonStock",
  ], period);

  let shares =
    getLatestFact(dei, "EntityCommonStockSharesOutstanding", "shares") ||
    getLatestFact(usGaap, "EntityCommonStockSharesOutstanding", "shares") ||
    getLatestFact(usGaap, "WeightedAverageNumberOfDilutedSharesOutstanding", "shares") ||
    getLatestFact(usGaap, "WeightedAverageNumberOfSharesOutstandingBasic", "shares");

  const revenueSeries = revenueSel.series;
  const grossProfitSeries = grossProfitSel.series;
  const netIncomeSeries = netIncomeSel.series;
  const sgaSeries = sgaSel.series;
  const rdSeries = rdSel.series;
  const ebitSeries = ebitSel.series;
  const interestSeries = interestSel.series;
  const assetsSeries = assetsSel.series;
  const liabilitiesSeries = liabilitiesSel.series;
  const equitySeries = equitySel.series;
  const currentAssetsSeries = currentAssetsSel.series;
  const currentLiabilitiesSeries = currentLiabilitiesSel.series;
  const retainedSeries = retainedSel.series;
  const longDebtSeries = longDebtSel.series;
  const shortDebtSeries = shortDebtSel.series;
  const operatingCashFlowSeries = operatingCashFlowSel.series;
  const capexSeries = capexSel.series;
  const dividendsSeries = dividendsSel.series;
  const repurchaseSeries = repurchaseSel.series;

  const currency =
    revenueSel.unit ||
    netIncomeSel.unit ||
    assetsSel.unit ||
    "USD";
  const fxRate = await getFxRate(currency, env);
  const convert = (value) =>
    value === null || value === undefined ? null : value * fxRate;

  const revenueItem = latestItem(revenueSeries);
  const grossProfitItem = latestItem(grossProfitSeries);
  const netIncomeItem = latestItem(netIncomeSeries);
  const sgaItem = latestItem(sgaSeries);
  const rdItem = latestItem(rdSeries);
  const ebitItem = latestItem(ebitSeries);
  const interestItem = latestItem(interestSeries);
  const assetsItem = latestItem(assetsSeries);
  const liabilitiesItem = latestItem(liabilitiesSeries);
  const equityItem = latestItem(equitySeries);
  const currentAssetsItem = latestItem(currentAssetsSeries);
  const currentLiabilitiesItem = latestItem(currentLiabilitiesSeries);
  const retainedItem = latestItem(retainedSeries);
  const longDebtItem = latestItem(longDebtSeries);
  const shortDebtItem = latestItem(shortDebtSeries);
  const operatingCashFlowItem = latestItem(operatingCashFlowSeries);
  const capexItem = latestItem(capexSeries);
  const dividendsItem = latestItem(dividendsSeries);
  const repurchaseItem = latestItem(repurchaseSeries);

  const revenue = convert(latestValue(revenueSeries));
  const grossProfit = convert(latestValue(grossProfitSeries));
  const netIncome = convert(latestValue(netIncomeSeries));
  const sga = convert(latestValue(sgaSeries));
  const rd = convert(latestValue(rdSeries));
  const ebit = convert(latestValue(ebitSeries));
  const interestExpense = convert(latestValue(interestSeries));

  const totalAssets = convert(latestValue(assetsSeries));
  const totalLiabilities = convert(latestValue(liabilitiesSeries));
  const totalEquity = convert(latestValue(equitySeries));
  const currentAssets = convert(latestValue(currentAssetsSeries));
  const currentLiabilities = convert(latestValue(currentLiabilitiesSeries));
  const retainedEarnings = convert(latestValue(retainedSeries));
  const longDebt = convert(latestValue(longDebtSeries));
  const shortDebt = convert(latestValue(shortDebtSeries));

  const operatingCashFlow = convert(latestValue(operatingCashFlowSeries));
  const capex = convert(latestValue(capexSeries));
  const dividendsPaid = convert(latestValue(dividendsSeries));
  const shareRepurchases = convert(latestValue(repurchaseSeries));

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
      : operatingCashFlow !== null
        ? operatingCashFlow
        : null;

  const workingCapital =
    currentAssets !== null && currentLiabilities !== null
      ? currentAssets - currentLiabilities
      : null;

  const quote = await fetchQuote(resolvedTicker, env);
  const marketPrice = quote?.price ?? null;
  if (!shares && quote?.sharesOutstanding) {
    shares = quote.sharesOutstanding;
  }
  if (!shares && marketPrice && quote?.marketCap) {
    shares = quote.marketCap / marketPrice;
  }
  const marketCap =
    quote?.marketCap ?? (marketPrice !== null && shares ? marketPrice * shares : null);

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

  const trailingNetIncome = netIncomeSeries
    .slice(0, 3)
    .map((row) => toNumber(row.val))
    .filter((value) => value !== null && Number.isFinite(value) && value > 0);
  const normalizedNetIncome = trailingNetIncome.length >= 2 ? average(trailingNetIncome) : null;

  const eps = netIncome && shares ? netIncome / shares : null;
  const normalizedEps = normalizedNetIncome !== null && shares ? normalizedNetIncome / shares : null;
  const epsForValuation = normalizedEps ?? eps;

  const graham = computeGrahamFairValue({
    eps: epsForValuation,
    growthRate,
    currentPrice: marketPrice,
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
    sharesOutstanding: shares,
    price: marketPrice,
    discountRate: 0.1,
    terminalGrowth: 0.02,
  });

  const provenance = {
    grossMargin: {
      sources: [
        sourceFrom(grossProfitSel, grossProfitItem),
        sourceFrom(revenueSel, revenueItem),
      ].filter(Boolean),
    },
    sgaEfficiency: {
      sources: [
        sourceFrom(sgaSel, sgaItem),
        sourceFrom(revenueSel, revenueItem),
      ].filter(Boolean),
    },
    rdReliance: {
      sources: [
        sourceFrom(rdSel, rdItem),
        sourceFrom(revenueSel, revenueItem),
      ].filter(Boolean),
    },
    netMargin: {
      sources: [
        sourceFrom(netIncomeSel, netIncomeItem),
        sourceFrom(revenueSel, revenueItem),
      ].filter(Boolean),
    },
    consistentEarnings: {
      sources: [sourceFrom(netIncomeSel, netIncomeItem)].filter(Boolean),
    },
    interestCoverage: {
      sources: [
        sourceFrom(ebitSel, ebitItem),
        sourceFrom(interestSel, interestItem),
      ].filter(Boolean),
    },
    debtToEquity: {
      sources: [
        sourceFrom(longDebtSel, longDebtItem),
        sourceFrom(shortDebtSel, shortDebtItem),
        sourceFrom(equitySel, equityItem),
      ].filter(Boolean),
    },
    roe: {
      sources: [
        sourceFrom(netIncomeSel, netIncomeItem),
        sourceFrom(equitySel, equityItem),
      ].filter(Boolean),
    },
    capexEfficiency: {
      sources: [
        sourceFrom(capexSel, capexItem),
        sourceFrom(operatingCashFlowSel, operatingCashFlowItem),
      ].filter(Boolean),
    },
  };

  return {
    ticker: resolvedTicker,
    name: facts?.entityName || resolvedTicker,
    sic,
    industry,
    peers,
    price: marketPrice,
    sharesOutstanding: shares || null,
    marketCap,
    currency,
    fxRate: fxRate !== 1 ? fxRate : null,
    period,
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
      freeCashFlow,
      marketCap,
    },
    provenance,
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

async function fetchSubmissions(cik, env) {
  const cacheKey = `sec:submissions:${cik}`;
  const cached = await getCache(env, cacheKey, true);
  if (cached) return cached;
  const data = await secFetchJson(`${SEC_SUBMISSIONS_BASE}${cik}.json`, env);
  await putCache(env, cacheKey, data);
  return data;
}

function fillPeerFallback(peers, ticker) {
  const unique = new Set(peers);
  for (const t of TRENDING) {
    if (unique.size >= 5) break;
    if (t === ticker) continue;
    unique.add(t);
  }
  return Array.from(unique).slice(0, 5);
}

async function getPeersForSic(env, sic, ticker) {
  if (!sic) return fillPeerFallback([], ticker);
  const key = `sic:${sic}`;
  const raw = await env.CACHE_KV.get(key, "json");
  const list = Array.isArray(raw) ? raw : [];
  if (!list.includes(ticker)) {
    list.unshift(ticker);
    const trimmed = list.slice(0, 200);
    await env.CACHE_KV.put(key, JSON.stringify(trimmed), {
      expirationTtl: SIC_PEERS_TTL,
    });
  }
  const peers = list.filter((item) => item !== ticker).slice(0, 5);
  return fillPeerFallback(peers, ticker);
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

async function fetchQuote(symbol, env) {
  const key = env.FMP_API_KEY || "";
  if (!key) return null;

  const primary = await fetchQuoteData(symbol, key);
  if (primary) return primary;

  if (symbol.includes(".")) {
    const alt = symbol.replace(".", "-");
    return fetchQuoteData(alt, key);
  }

  if (symbol.includes("-")) {
    const alt = symbol.replace("-", ".");
    return fetchQuoteData(alt, key);
  }

  return null;
}

async function fetchQuoteData(symbol, key) {
  const url = new URL(FMP_QUOTE_URL);
  url.search = new URLSearchParams({ symbol, apikey: key }).toString();
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) return null;
  const quote = data[0] || {};
  return {
    price: typeof quote.price === "number" ? quote.price : null,
    marketCap: typeof quote.marketCap === "number" ? quote.marketCap : null,
    sharesOutstanding:
      typeof quote.sharesOutstanding === "number" ? quote.sharesOutstanding : null,
  };
}

function getAnnualSeries(usGaap, tag, unit = "USD", period = "annual") {
  const fact = usGaap?.[tag];
  const units = fact?.units || {};
  let selectedUnit = unit;
  let items = units[unit];
  if (!items || !items.length) {
    const keys = Object.keys(units);
    if (keys.length) {
      selectedUnit = keys[0];
      items = units[selectedUnit];
    } else {
      items = [];
    }
  }
  const formSet = period === "quarterly" ? QUARTERLY_FORMS : ANNUAL_FORMS;
  const annual = items.filter((item) => {
    if (!item.form || !formSet.has(item.form)) return false;
    if (!item.fp) return true;
    if (period === "quarterly") return item.fp.startsWith("Q");
    return item.fp === "FY" || item.fp === "FYI";
  });

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

  const sorted = Array.from(byYear.values()).sort((a, b) => (b.fy || 0) - (a.fy || 0));
  sorted.unit = selectedUnit;
  return sorted;
}

function selectSeries(usGaap, tags, period, unit = "USD") {
  for (const tag of tags) {
    const series = getAnnualSeries(usGaap, tag, unit, period);
    if (series.length) {
      return {
        tag,
        series,
        unit: series.unit || unit,
      };
    }
  }
  return { tag: tags[0], series: [], unit };
}

function getLatestFact(usGaap, tag, unit) {
  const fact = usGaap?.[tag];
  const items = fact?.units?.[unit] || [];
  const filtered = items.filter((item) => item.end && item.form && ALL_FORMS.has(item.form));
  filtered.sort((a, b) => (a.end < b.end ? 1 : -1));
  return filtered.length ? toNumber(filtered[0].val) : null;
}

function latestValue(series) {
  if (!series || !series.length) return null;
  return toNumber(series[0].val);
}

function latestItem(series) {
  if (!series || !series.length) return null;
  return series[0];
}

function sourceFrom(selection, item) {
  if (!selection || !item) return null;
  return {
    tag: selection.tag,
    unit: selection.unit || null,
    end: item.end || null,
    fy: item.fy || null,
    form: item.form || null,
    val: item.val ?? null,
  };
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

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizePeriod(value) {
  if (!value) return "annual";
  const v = value.toLowerCase();
  if (v.startsWith("q")) return "quarterly";
  if (v === "quarterly") return "quarterly";
  return "annual";
}

async function getFxRate(currency, env) {
  if (!currency || currency === "USD") return 1;
  const cacheKey = `fx:${currency}`;
  const cached = await getCache(env, cacheKey, true);
  if (cached && cached.rate) return cached.rate;

  const url = new URL("https://api.exchangerate.host/latest");
  url.search = new URLSearchParams({ base: currency, symbols: "USD" }).toString();
  const res = await fetch(url.toString());
  if (!res.ok) return 1;
  const data = await res.json();
  const rate = data?.rates?.USD;
  if (!rate || Number.isNaN(rate)) return 1;

  await putCache(env, cacheKey, { rate });
  return rate;
}
