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

const API_BASE = window.VALUE_CHECK_API_BASE || "";

function formatValue(value, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value}${suffix}`;
}

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return `${value.toFixed(2)}`;
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function formatRatio(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(2);
}

function generateMoatSignals(data) {
  const { metrics, snapshots } = data;
  const gm = metrics.grossMargin;
  const nm = metrics.netMargin;
  const capexEff = metrics.capexEfficiency;
  const debtEq = metrics.debtToEquity;
  const interest = metrics.interestCoverage;
  const z = snapshots.altmanZ;
  const yieldPct = snapshots.shareholderYield;

  const signals = [];

  if (gm === null && nm === null) {
    signals.push({
      label: "Pricing Power",
      tone: "neutral",
      text: "Unclear due to missing margin data.",
    });
  } else if (gm !== null && gm > 40 && nm !== null && nm > 20) {
    signals.push({
      label: "Pricing Power",
      tone: "good",
      text: `Strong: gross margin ${formatPercent(gm)} and net margin ${formatPercent(nm)}.`,
    });
  } else if (gm !== null && gm > 40) {
    signals.push({
      label: "Pricing Power",
      tone: "mixed",
      text: `Gross margin is strong at ${formatPercent(gm)}, but net margin is ${formatPercent(nm)}.`,
    });
  } else if (nm !== null && nm > 20) {
    signals.push({
      label: "Pricing Power",
      tone: "mixed",
      text: `Net margin is healthy at ${formatPercent(nm)}, gross margin is ${formatPercent(gm)}.`,
    });
  } else {
    signals.push({
      label: "Pricing Power",
      tone: "warn",
      text: `Margins are below target (gross ${formatPercent(gm)}, net ${formatPercent(nm)}).`,
    });
  }

  if (capexEff === null) {
    signals.push({
      label: "Capital Intensity",
      tone: "neutral",
      text: "Unclear due to missing capex data.",
    });
  } else if (capexEff < 50) {
    signals.push({
      label: "Capital Intensity",
      tone: "good",
      text: `Manageable; capex efficiency is ${formatPercent(capexEff)}.`,
    });
  } else {
    signals.push({
      label: "Capital Intensity",
      tone: "warn",
      text: `Heavy; capex efficiency is ${formatPercent(capexEff)}.`,
    });
  }

  if (debtEq === null && interest === null) {
    signals.push({
      label: "Balance Sheet Risk",
      tone: "neutral",
      text: "Unclear due to missing leverage data.",
    });
  } else if (debtEq !== null && debtEq < 0.5 && interest !== null && interest > 6) {
    signals.push({
      label: "Balance Sheet Risk",
      tone: "good",
      text: `Low risk: Debt/Equity ${formatRatio(debtEq)}, Interest Coverage ${interest.toFixed(1)}x.`,
    });
  } else {
    signals.push({
      label: "Balance Sheet Risk",
      tone: "mixed",
      text: `Mixed: Debt/Equity ${formatRatio(debtEq)}, Interest Coverage ${interest === null ? "-" : `${interest.toFixed(1)}x`}.`,
    });
  }

  if (z === null) {
    signals.push({
      label: "Solvency (Altman Z)",
      tone: "neutral",
      text: "Unavailable.",
    });
  } else if (z >= 3) {
    signals.push({
      label: "Solvency (Altman Z)",
      tone: "good",
      text: `${z.toFixed(2)} indicates lower distress risk.`,
    });
  } else if (z >= 1.8) {
    signals.push({
      label: "Solvency (Altman Z)",
      tone: "mixed",
      text: `${z.toFixed(2)} is in the caution zone.`,
    });
  } else {
    signals.push({
      label: "Solvency (Altman Z)",
      tone: "warn",
      text: `${z.toFixed(2)} indicates higher distress risk.`,
    });
  }

  if (yieldPct === null) {
    signals.push({
      label: "Buyback Aggressiveness",
      tone: "neutral",
      text: "Shareholder yield unavailable.",
    });
  } else if (yieldPct >= 5) {
    signals.push({
      label: "Buyback Aggressiveness",
      tone: "good",
      text: `High shareholder yield at ${formatPercent(yieldPct)}.`,
    });
  } else if (yieldPct >= 2) {
    signals.push({
      label: "Buyback Aggressiveness",
      tone: "mixed",
      text: `Moderate shareholder yield at ${formatPercent(yieldPct)}.`,
    });
  } else {
    signals.push({
      label: "Buyback Aggressiveness",
      tone: "warn",
      text: `Light shareholder yield at ${formatPercent(yieldPct)}.`,
    });
  }

  return signals;
}

function formatSourceList(sources) {
  if (!Array.isArray(sources) || !sources.length) return "";
  return sources
    .map((source) => {
      const parts = [
        source.tag,
        source.form || null,
        source.fy ? `FY${source.fy}` : null,
        source.end || null,
        source.unit ? `(${source.unit})` : null,
      ].filter(Boolean);
      return parts.join(" ");
    })
    .join(" • ");
}

function emptyData(ticker = "") {
  return {
    ticker,
    name: "",
    price: null,
    marketCap: null,
    industry: null,
    peers: [],
    lastUpdated: "—",
    metrics: {
      grossMargin: null,
      sgaEfficiency: null,
      rdReliance: null,
      netMargin: null,
      consistentEarnings: null,
      consistentEarningsYears: null,
      interestCoverage: null,
      debtToEquity: null,
      roe: null,
      capexEfficiency: null,
      dollarTest: null,
    },
    snapshots: {
      shareholderYield: null,
      solvency: "Unknown",
      altmanZ: null,
    },
    valuation: {
      dcf: { low: null, base: null, high: null },
      graham: null,
      lynch: null,
      impliedGrowth: null,
      current: null,
    },
  };
}

const routes = [
  "home",
  "analyzer",
  "compare",
  "valuation",
  "memo",
  "snapshot",
  "methodology",
  "support",
];

const state = {
  ticker: "",
  data: emptyData(""),
  compare: {
    left: emptyData(""),
    right: emptyData(""),
  },
  error: null,
  loading: false,
  period: "annual",
};

const $ = (id) => document.getElementById(id);

const suggestionsState = {
  items: [],
  open: false,
};

function debounce(fn, wait = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function renderError(message) {
  const banner = $("error-banner");
  if (!banner) return;
  if (message) {
    banner.textContent = message;
    banner.classList.add("is-active");
  } else {
    banner.textContent = "";
    banner.classList.remove("is-active");
  }
}

function setLoading(isLoading) {
  state.loading = isLoading;
  const overlay = $("loading-overlay");
  if (!overlay) return;
  overlay.classList.toggle("is-active", isLoading);
}

function updateNavLinks() {
  const navAnalyzer = $("nav-analyzer");
  if (!navAnalyzer) return;
  navAnalyzer.href = state.ticker ? `#/analyzer/${encodeURIComponent(state.ticker)}` : "#/analyzer";
}

async function fetchSuggestions(query) {
  if (!API_BASE) return [];
  try {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch (err) {
    console.error(err);
    return [];
  }
}

function renderSuggestions(list) {
  const container = $("search-suggestions");
  if (!container) return;
  suggestionsState.items = list;
  suggestionsState.open = list.length > 0;
  renderSuggestionsList(container, list, { hrefBase: "analyzer" });
}

function closeSuggestions() {
  const container = $("search-suggestions");
  if (!container) return;
  container.classList.remove("is-active");
  suggestionsState.open = false;
}

function renderSuggestionsList(container, list, options = {}) {
  container.innerHTML = "";
  container.classList.toggle("is-active", list.length > 0);
  list.forEach((item) => {
    const row = document.createElement("a");
    row.className = "suggestion-item";
    row.dataset.ticker = item.ticker;
    row.href = options.hrefBase
      ? `#/${options.hrefBase}/${encodeURIComponent(item.ticker)}`
      : "#";
    row.innerHTML = `
      <span class="suggestion-ticker">${item.ticker}</span>
      <span class="suggestion-title">${item.title || ""}</span>
    `;
    container.appendChild(row);
  });
}

function closeCompareSuggestions() {
  ["compare-left-suggestions", "compare-right-suggestions"].forEach((id) => {
    const container = $(id);
    if (container) container.classList.remove("is-active");
  });
}

async function resolveTickerFromInput(rawValue) {
  const value = rawValue.trim();
  if (!value) return "";
  if (suggestionsState.items.length) return suggestionsState.items[0].ticker;

  if (API_BASE && value.length >= 2) {
    const results = await fetchSuggestions(value);
    if (results.length) return results[0].ticker;
  }

  return value.toUpperCase();
}

function setActiveRoute(route) {
  routes.forEach((name) => {
    const section = document.querySelector(`[data-route="${name}"]`);
    if (!section) return;
    section.classList.toggle("is-active", name === route);
  });
}

function parseHash() {
  const hash = window.location.hash || "";
  if (!hash || hash === "#") return { route: "home" };

  const match = hash.match(/^#\/([^/]+)\/?(.*)?$/);
  if (!match) return { route: "home" };

  const route = match[1];
  const rest = match[2] || "";
  if (!routes.includes(route)) return { route: "home" };

  const ticker = rest ? decodeURIComponent(rest) : null;
  return { route, ticker };
}

function goTo(route, ticker) {
  const next = ticker
    ? `#/${route}/${encodeURIComponent(ticker)}`
    : `#/${route}`;
  if (window.location.hash === next) {
    render();
    return;
  }
  window.location.hash = next;
}

function goToCompare(left, right) {
  const next = `#/compare/${encodeURIComponent(left)}/${encodeURIComponent(right)}`;
  if (window.location.hash === next) {
    render();
    return;
  }
  window.location.hash = next;
}

function renderPeers(data) {
  const bar = $("peer-bar");
  const chips = $("peer-chips");
  const base = $("peer-base");
  if (!bar || !chips || !base) return;
  const peers = Array.isArray(data.peers) ? data.peers : [];
  if (!data.ticker || peers.length === 0) {
    bar.style.display = "none";
    return;
  }
  bar.style.display = "flex";
  base.textContent = data.ticker;
  chips.innerHTML = "";
  peers.forEach((peer) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "peer-chip";
    btn.dataset.peer = peer;
    btn.textContent = peer;
    chips.appendChild(btn);
  });
}

function scoreChecklist(metrics) {
  const hasValue = (value) => value !== null && value !== undefined;
  const checks = [
    {
      key: "grossMargin",
      label: "Gross Margin > 40%",
      value: hasValue(metrics.grossMargin) ? formatValue(metrics.grossMargin, "%") : "—",
      pass: hasValue(metrics.grossMargin) ? metrics.grossMargin > 40 : null,
    },
    {
      key: "sgaEfficiency",
      label: "SG&A Efficiency < 30%",
      value: hasValue(metrics.sgaEfficiency) ? formatValue(metrics.sgaEfficiency, "%") : "—",
      pass: hasValue(metrics.sgaEfficiency) ? metrics.sgaEfficiency < 30 : null,
    },
    {
      key: "rdReliance",
      label: "R&D Reliance < 30%",
      value: hasValue(metrics.rdReliance) ? formatValue(metrics.rdReliance, "%") : "—",
      pass: hasValue(metrics.rdReliance) ? metrics.rdReliance < 30 : null,
    },
    {
      key: "netMargin",
      label: "Net Margin > 20%",
      value: hasValue(metrics.netMargin) ? formatValue(metrics.netMargin, "%") : "—",
      pass: hasValue(metrics.netMargin) ? metrics.netMargin > 20 : null,
    },
    {
      key: "consistentEarnings",
      label: "Consistent Earnings (all yrs)",
      value: metrics.consistentEarningsYears
        ? `${metrics.consistentEarnings}/${metrics.consistentEarningsYears} yrs`
        : "—",
      pass: metrics.consistentEarningsYears
        ? metrics.consistentEarningsYears >= 5 &&
          metrics.consistentEarnings === metrics.consistentEarningsYears
        : null,
    },
    {
      key: "interestCoverage",
      label: "Interest Coverage > 6x",
      value: hasValue(metrics.interestCoverage) ? `${metrics.interestCoverage}x` : "—",
      pass: hasValue(metrics.interestCoverage) ? metrics.interestCoverage > 6 : null,
    },
    {
      key: "debtToEquity",
      label: "Debt / Equity < 0.5",
      value: hasValue(metrics.debtToEquity) ? formatValue(metrics.debtToEquity) : "—",
      pass: hasValue(metrics.debtToEquity) ? metrics.debtToEquity < 0.5 : null,
    },
    {
      key: "roe",
      label: "ROE > 15%",
      value: hasValue(metrics.roe) ? formatValue(metrics.roe, "%") : "—",
      pass: hasValue(metrics.roe) ? metrics.roe > 15 : null,
    },
    {
      key: "capexEfficiency",
      label: "Capex Efficiency < 50%",
      value: hasValue(metrics.capexEfficiency) ? formatValue(metrics.capexEfficiency, "%") : "—",
      pass: hasValue(metrics.capexEfficiency) ? metrics.capexEfficiency < 50 : null,
    },
    {
      key: "dollarTest",
      label: "$1 Test > 1.0",
      value: hasValue(metrics.dollarTest) ? formatValue(metrics.dollarTest) : "—",
      pass: hasValue(metrics.dollarTest) ? metrics.dollarTest > 1 : null,
    },
  ];

  const available = checks.filter((c) => c.pass !== null).length;
  const score = available ? checks.reduce((sum, c) => sum + (c.pass ? 1 : 0), 0) : null;
  let verdict = available ? "Weak" : "Unavailable";
  if (score !== null && score >= 8) verdict = "Strong";
  else if (score !== null && score >= 5) verdict = "Mixed";

  return { score, verdict, checks, available };
}

function marginOfSafety(valuation) {
  const base = valuation.dcf.base || valuation.lynch || valuation.graham || valuation.current;
  if (!base || !valuation.current) return null;
  return ((base - valuation.current) / valuation.current) * 100;
}

async function renderTrending() {
  const container = $("trending-list");
  if (!container) return;
  container.innerHTML = "";
  let list = TRENDING;
  if (API_BASE) {
    try {
      const res = await fetch(`${API_BASE}/trending`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tickers)) list = data.tickers;
      }
    } catch (err) {
      console.error(err);
    }
  }

  list.forEach((ticker) => {
    const card = document.createElement("div");
    card.className = "ticker";
    card.textContent = ticker;
    card.addEventListener("click", () => goTo("analyzer", ticker));
    container.appendChild(card);
  });
}

function compareWinner(leftValue, rightValue, direction) {
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return null;
  if (leftValue === rightValue) return null;
  if (direction === "lower") return leftValue < rightValue ? "left" : "right";
  return leftValue > rightValue ? "left" : "right";
}

function renderCompare(leftData, rightData) {
  const grid = $("compare-grid");
  if (!grid) return;
  grid.innerHTML = "";

  if (!leftData?.ticker || !rightData?.ticker) {
    grid.innerHTML = `<div class="compare-empty">Enter two tickers to compare.</div>`;
    return;
  }

  const leftScore = scoreChecklist(leftData.metrics);
  const rightScore = scoreChecklist(rightData.metrics);
  const leftScoreRatio =
    leftScore.score === null || !leftScore.available
      ? null
      : leftScore.score / leftScore.available;
  const rightScoreRatio =
    rightScore.score === null || !rightScore.available
      ? null
      : rightScore.score / rightScore.available;

  const header = document.createElement("div");
  header.className = "compare-row compare-header";
  header.innerHTML = `
    <div class="compare-label">Metric</div>
    <div class="compare-cell">${leftData.name || leftData.ticker} (${leftData.ticker})</div>
    <div class="compare-cell">${rightData.name || rightData.ticker} (${rightData.ticker})</div>
  `;
  grid.appendChild(header);

  const rows = [
    {
      label: "Value Check Score",
      leftDisplay:
        leftScore.score === null ? "—" : `${leftScore.score}/${leftScore.available || 10}`,
      rightDisplay:
        rightScore.score === null ? "—" : `${rightScore.score}/${rightScore.available || 10}`,
      leftValue: leftScoreRatio,
      rightValue: rightScoreRatio,
      direction: "higher",
    },
    {
      label: "Gross Margin",
      leftDisplay: formatValue(leftData.metrics.grossMargin, "%"),
      rightDisplay: formatValue(rightData.metrics.grossMargin, "%"),
      leftValue: leftData.metrics.grossMargin,
      rightValue: rightData.metrics.grossMargin,
      direction: "higher",
    },
    {
      label: "Net Margin",
      leftDisplay: formatValue(leftData.metrics.netMargin, "%"),
      rightDisplay: formatValue(rightData.metrics.netMargin, "%"),
      leftValue: leftData.metrics.netMargin,
      rightValue: rightData.metrics.netMargin,
      direction: "higher",
    },
    {
      label: "ROE",
      leftDisplay: formatValue(leftData.metrics.roe, "%"),
      rightDisplay: formatValue(rightData.metrics.roe, "%"),
      leftValue: leftData.metrics.roe,
      rightValue: rightData.metrics.roe,
      direction: "higher",
    },
    {
      label: "Debt / Equity",
      leftDisplay: formatValue(leftData.metrics.debtToEquity),
      rightDisplay: formatValue(rightData.metrics.debtToEquity),
      leftValue: leftData.metrics.debtToEquity,
      rightValue: rightData.metrics.debtToEquity,
      direction: "lower",
    },
    {
      label: "Interest Coverage",
      leftDisplay:
        leftData.metrics.interestCoverage === null
          ? "—"
          : `${leftData.metrics.interestCoverage}x`,
      rightDisplay:
        rightData.metrics.interestCoverage === null
          ? "—"
          : `${rightData.metrics.interestCoverage}x`,
      leftValue: leftData.metrics.interestCoverage,
      rightValue: rightData.metrics.interestCoverage,
      direction: "higher",
    },
    {
      label: "Shareholder Yield",
      leftDisplay:
        leftData.snapshots.shareholderYield === null
          ? "—"
          : `${leftData.snapshots.shareholderYield}%`,
      rightDisplay:
        rightData.snapshots.shareholderYield === null
          ? "—"
          : `${rightData.snapshots.shareholderYield}%`,
      leftValue: leftData.snapshots.shareholderYield,
      rightValue: rightData.snapshots.shareholderYield,
      direction: "higher",
    },
    {
      label: "Altman Z-Score",
      leftDisplay: leftData.snapshots.altmanZ ?? "—",
      rightDisplay: rightData.snapshots.altmanZ ?? "—",
      leftValue: leftData.snapshots.altmanZ,
      rightValue: rightData.snapshots.altmanZ,
      direction: "higher",
    },
    {
      label: "Market Cap",
      leftDisplay: formatCurrency(leftData.marketCap),
      rightDisplay: formatCurrency(rightData.marketCap),
      leftValue: leftData.marketCap,
      rightValue: rightData.marketCap,
      direction: "higher",
    },
  ];

  rows.forEach((row) => {
    const winner = compareWinner(row.leftValue, row.rightValue, row.direction);
    const rowEl = document.createElement("div");
    rowEl.className = "compare-row";
    rowEl.innerHTML = `
      <div class="compare-label">${row.label}</div>
      <div class="compare-cell ${winner === "left" ? "win" : ""}">${row.leftDisplay}</div>
      <div class="compare-cell ${winner === "right" ? "win" : ""}">${row.rightDisplay}</div>
    `;
    grid.appendChild(rowEl);
  });

  const leftInput = $("compare-left");
  const rightInput = $("compare-right");
  if (leftInput) leftInput.value = leftData.ticker;
  if (rightInput) rightInput.value = rightData.ticker;
}

function renderHomeHero(data) {
  const { score, verdict, available } = scoreChecklist(data.metrics);
  $("hero-score").textContent =
    score === null ? "—" : `${score}/${available || 10}`;
  const mos = marginOfSafety(data.valuation);
  $("hero-mos").textContent = mos === null ? "—" : `${mos.toFixed(1)}%`;
  $("hero-solvency").textContent = data.snapshots.solvency;
  $("hero-yield").textContent =
    data.snapshots.shareholderYield === null
      ? "—"
      : `${data.snapshots.shareholderYield}%`;
  $("hero-updated").textContent = data.lastUpdated;
  document.querySelector(".hero-card__meta").textContent = data.ticker
    ? `${data.ticker} · ${verdict}`
    : "Run a check to see a score";
}

function renderAnalyzer(data) {
  const name = data.name ? `${data.name} (${data.ticker})` : data.ticker || "Analyzer";
  $("analyzer-title").textContent = `${name} · Analyzer`;
  const metaParts = [
    `Last updated: ${data.lastUpdated}`,
    "Annual",
    data.industry ? `Industry: ${data.industry}` : null,
    data.price !== null && data.price !== undefined ? `Price: ${formatCurrency(data.price)}` : null,
    data.marketCap !== null && data.marketCap !== undefined
      ? `Market Cap: ${formatCurrency(data.marketCap)}`
      : null,
  ].filter(Boolean);
  $("analyzer-meta").textContent = metaParts.join(" · ");

  const { score, verdict, checks, available } = scoreChecklist(data.metrics);
  $("final-score").textContent =
    score === null ? "—" : `${score}/${available || 10}`;
  $("final-verdict").textContent = verdict;
  const signalLabel = available ? `${available} signals · pass/fail` : "No signals available";

  const table = $("checklist-table");
  table.innerHTML = "";
  checks.forEach((check) => {
    const row = document.createElement("div");
    row.className = "table-row";

    const label = document.createElement("div");
    label.className = "label-cell";
    label.textContent = check.label;
    const provenance = data.provenance?.[check.key]?.sources;
    const sourceText = formatSourceList(provenance);
    if (sourceText) {
      const badge = document.createElement("span");
      badge.className = "source-badge";
      badge.textContent = "SEC";
      badge.title = sourceText;
      label.appendChild(badge);
    }

    const value = document.createElement("div");
    value.textContent = check.value;

    const result = document.createElement("div");
    if (check.pass === null) {
      result.className = "result na";
      result.textContent = "No data";
    } else {
      result.className = `result ${check.pass ? "pass" : "fail"}`;
      result.textContent = check.pass ? "Pass" : "Fail";
    }

    row.append(label, value, result);
    table.appendChild(row);
  });

  const snapshot = $("snapshot-grid");
  snapshot.innerHTML = "";
  const items = [
    { label: "Price", value: formatCurrency(data.price) },
    { label: "Market Cap", value: formatCurrency(data.marketCap) },
    {
      label: "Shareholder Yield",
      value:
        data.snapshots.shareholderYield === null
          ? "Not available"
          : `${data.snapshots.shareholderYield}% returned`,
    },
    {
      label: "Altman Z-Score",
      value: data.snapshots.altmanZ ?? "Not available",
    },
  ];

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "snapshot-card";
    card.innerHTML = `<span class="muted">${item.label}</span><strong>${item.value}</strong>`;
    snapshot.appendChild(card);
  });

  const checklistMeta = table.parentElement?.querySelector(".panel-head .muted");
  if (checklistMeta) checklistMeta.textContent = signalLabel;

  $("to-valuation").onclick = () => goTo("valuation", data.ticker);
  renderPeers(data);

  const moat = $("moat-summary");
  if (moat) {
    const toneLabel = {
      good: "Strong",
      mixed: "Mixed",
      warn: "Watch",
      neutral: "No Data",
    };
    const paragraphs = generateMoatSignals(data)
      .map(
        (signal) =>
          `<div class="moat-item">
            <div class="moat-item-head">
              <strong>${signal.label}</strong>
              <span class="moat-tone ${signal.tone}">${toneLabel[signal.tone] || "Mixed"}</span>
            </div>
            <p>${signal.text}</p>
          </div>`
      )
      .join("");
    moat.innerHTML = paragraphs;
  }
}

function renderValuation(data) {
  $("valuation-title").textContent = `${data.ticker} · Fair Value`;

  const mos = marginOfSafety(data.valuation);
  $("mos-pill").textContent =
    mos === null ? "Margin of Safety —" : `Margin of Safety ${mos.toFixed(1)}%`;

  const bars = $("valuation-bars");
  bars.innerHTML = "";

  const entries = [
    { label: "DCF (Base)", value: data.valuation.dcf.base },
    { label: "Graham", value: data.valuation.graham },
    { label: "Lynch", value: data.valuation.lynch },
    { label: "Current", value: data.valuation.current },
  ].filter((entry) => entry.value !== null && entry.value !== undefined);

  if (entries.length) {
    const max = Math.max(...entries.map((e) => e.value));
    entries.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "bar";
      const width = Math.max(20, (entry.value / max) * 100);
      row.innerHTML = `<span style="width:${width}%">${entry.label} · $${entry.value.toFixed(2)}</span>`;
      bars.appendChild(row);
    });
  } else {
    bars.innerHTML = "<div class=\"muted\">Valuation data unavailable.</div>";
  }

  if (data.valuation.impliedGrowth !== null && data.valuation.impliedGrowth !== undefined) {
    $("implied-growth").textContent = `Implied growth to match price: ${data.valuation.impliedGrowth.toFixed(
      1
    )}% annually.`;
  } else {
    $("implied-growth").textContent = "Implied growth unavailable.";
  }

  const verdict =
    mos === null ? "Unknown" : mos > 15 ? "Optimistic" : mos > -5 ? "Neutral" : "Pessimistic";
  $("valuation-verdict").textContent = `Verdict: ${verdict}`;
  $("to-memo").onclick = () => goTo("memo", data.ticker);
}

function renderMemo(data) {
  $("memo-title").textContent = `${data.ticker} · Investment Memo`;
  const { score, verdict, available } = scoreChecklist(data.metrics);
  const mos = marginOfSafety(data.valuation);
  const companyName = data.name || data.ticker || "this company";

  const moatLines = generateMoatSignals(data)
    .map((signal) => `- ${signal.label}: ${signal.text}`)
    .join("\n");

  const memo = [
    `Executive Summary`,
    score === null
      ? `Data is not available yet for ${companyName}. Try again later.`
      : `${companyName} (${data.ticker}) scores ${score}/${available || 10} on the Value Check. The score suggests a ${verdict.toLowerCase()} profile${mos === null ? "." : `, with a margin of safety around ${mos.toFixed(1)}%.`}`,
    ``,
    `Moat Signals Summary`,
    moatLines,
    `Bull Case`,
    `- Strong shareholder yield (${data.snapshots.shareholderYield ?? "—"}%).`,
    `- Conservative leverage with debt/equity of ${data.metrics.debtToEquity ?? "—"}.`,
    `- Interest coverage of ${data.metrics.interestCoverage ?? "—"}x indicates stability.`,
    `Bear Case`,
    `- Gross margin below 40% threshold.`,
    `- ROE under 15% target.`
  ].join("\n");

  $("memo-text").value = memo;
  $("to-snapshot").onclick = () => goTo("snapshot", data.ticker);
}

function renderSnapshot(data) {
  $("snapshot-title").textContent = `${data.ticker} · Snapshot`;
  const { score, verdict, available } = scoreChecklist(data.metrics);
  const mos = marginOfSafety(data.valuation);

  $("snapshot-content").innerHTML = `
    <h3>Value Check Final Score</h3>
    <p><strong>${score === null ? "—" : `${score}/${available || 10}`}</strong> · ${verdict}</p>
    <h3>Margin of Safety</h3>
    <p>${mos === null ? "—" : `${mos.toFixed(1)}%`}</p>
    <h3>Key Signals</h3>
    <p>Gross Margin: ${data.metrics.grossMargin ?? "—"}% · ROE: ${data.metrics.roe ?? "—"}% · Debt/Equity: ${data.metrics.debtToEquity ?? "—"}</p>
    <h3>Valuation</h3>
    <p>DCF Base: $${data.valuation.dcf.base ?? "—"} · Graham: $${data.valuation.graham ?? "—"} · Lynch: $${data.valuation.lynch ?? "—"}</p>
  `;

  $("copy-link").onclick = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      $("copy-link").textContent = "Copied";
      setTimeout(() => ($("copy-link").textContent = "Copy Link"), 1500);
    } catch (err) {
      console.error(err);
    }
  };
}

async function fetchStock(ticker) {
  if (!API_BASE) throw new Error("API base not configured.");

  const response = await fetch(`${API_BASE}/stock/${ticker}?period=${state.period}`);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Unable to fetch data");
  }
  return response.json();
}

async function loadTicker(ticker) {
  try {
    const data = await fetchStock(ticker);
    state.ticker = ticker;
    state.data = data;
    state.error = null;
  } catch (err) {
    console.error(err);
    state.data = emptyData(ticker);
    state.error = "Data unavailable. Try again later.";
  }
}

async function loadCompare(left, right) {
  try {
    const [leftData, rightData] = await Promise.all([fetchStock(left), fetchStock(right)]);
    state.compare = { left: leftData, right: rightData };
    state.error = null;
  } catch (err) {
    console.error(err);
    state.compare = { left: emptyData(left), right: emptyData(right) };
    state.error = "Data unavailable. Try again later.";
  }
}

async function render() {
  const { route, ticker } = parseHash();
  const needsTicker = ["analyzer", "valuation", "memo", "snapshot"].includes(route);

  if (route === "compare") {
    setActiveRoute("compare");
    renderError(null);
    const parts = ticker ? ticker.split("/").filter(Boolean) : [];
    if (parts.length >= 2) {
      setLoading(true);
      await loadCompare(parts[0], parts[1]);
      setLoading(false);
      renderError(state.error);
      renderCompare(state.compare.left, state.compare.right);
    } else {
      renderCompare(state.compare.left, state.compare.right);
    }
    return;
  }

  if (needsTicker && !ticker && state.ticker) {
    goTo(route, state.ticker);
    return;
  }

  if (needsTicker && !ticker && !state.ticker) {
    state.error = "Enter a ticker to analyze.";
    setActiveRoute("home");
    renderError(state.error);
    renderHomeHero(state.data);
    return;
  }

  if (ticker) {
    setLoading(true);
    setActiveRoute(route);
    renderError(null);
    renderHomeHero(state.data);
    await loadTicker(ticker);
    setLoading(false);
  }

  setActiveRoute(route);
  renderError(state.error);
  renderHomeHero(state.data);
  if (route === "analyzer") renderAnalyzer(state.data);
  if (route === "valuation") renderValuation(state.data);
  if (route === "memo") renderMemo(state.data);
  if (route === "snapshot") renderSnapshot(state.data);
}

function init() {
  renderTrending();
  renderHomeHero(state.data);

  const tickerInput = $("ticker-input");
  const tickerGo = $("ticker-go");

  const debouncedSuggest = debounce(async (value) => {
    const list = await fetchSuggestions(value);
    renderSuggestions(list);
  }, 300);

  if (tickerInput) {
    tickerInput.addEventListener("input", () => {
      const value = tickerInput.value.trim();
      if (value.length < 2) {
        renderSuggestions([]);
        return;
      }
      debouncedSuggest(value);
    });

    tickerInput.addEventListener("focus", () => {
      if (suggestionsState.items.length) {
        renderSuggestions(suggestionsState.items);
      }
    });

    tickerInput.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const picked = await resolveTickerFromInput(tickerInput.value);
        if (!picked) return;
        closeSuggestions();
        goTo("analyzer", picked);
      }
    });
  }

  if (tickerGo) {
    tickerGo.addEventListener("click", async () => {
      const picked = await resolveTickerFromInput(tickerInput?.value || "");
      if (!picked) return;
      closeSuggestions();
      goTo("analyzer", picked);
    });
  }

  const suggestions = $("search-suggestions");
  if (suggestions) {
    const onPick = (event) => {
      const row = event.target.closest(".suggestion-item");
      if (!row) return;
      event.preventDefault();
      event.stopPropagation();
      const ticker = row.dataset.ticker;
      if (!ticker) return;
      if (tickerInput) tickerInput.value = ticker;
      closeSuggestions();
      goTo("analyzer", ticker);
    };
    suggestions.addEventListener("pointerdown", onPick);
    suggestions.addEventListener("click", onPick);
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search") && !event.target.closest(".compare-field")) {
      closeSuggestions();
      closeCompareSuggestions();
    }
  });

  $("nav-search").addEventListener("click", () => {
    document.getElementById("ticker-input").focus();
    goTo("home");
  });

  const navAnalyzer = $("nav-analyzer");
  if (navAnalyzer) {
    navAnalyzer.addEventListener("click", (event) => {
      event.preventDefault();
      if (state.ticker) {
        goTo("analyzer", state.ticker);
      } else {
        state.error = "Enter a ticker to analyze.";
        goTo("home");
      }
    });
  }

  const compareLeft = $("compare-left");
  const compareRight = $("compare-right");
  const compareGo = $("compare-go");
  const compareLeftSuggestions = $("compare-left-suggestions");
  const compareRightSuggestions = $("compare-right-suggestions");
  const triggerCompare = async () => {
    const left = await resolveTickerFromInput(compareLeft?.value || "");
    const right = await resolveTickerFromInput(compareRight?.value || "");
    if (!left || !right) {
      renderError("Enter two tickers to compare.");
      return;
    }
    renderError(null);
    closeCompareSuggestions();
    goToCompare(left, right);
  };

  const bindCompareInput = (input, container) => {
    if (!input || !container) return;
    const debounced = debounce(async (value) => {
      const list = await fetchSuggestions(value);
      renderSuggestionsList(container, list);
    }, 300);

    input.addEventListener("input", () => {
      const value = input.value.trim();
      if (value.length < 2) {
        renderSuggestionsList(container, []);
        return;
      }
      debounced(value);
    });

    input.addEventListener("focus", () => {
      if (container.childElementCount > 0) {
        container.classList.add("is-active");
      }
    });

    const onPick = (event) => {
      const row = event.target.closest(".suggestion-item");
      if (!row) return;
      event.preventDefault();
      const ticker = row.dataset.ticker;
      if (!ticker) return;
      input.value = ticker;
      renderSuggestionsList(container, []);
    };

    container.addEventListener("pointerdown", onPick);
    container.addEventListener("click", onPick);
  };

  bindCompareInput(compareLeft, compareLeftSuggestions);
  bindCompareInput(compareRight, compareRightSuggestions);

  if (compareGo) {
    compareGo.addEventListener("click", triggerCompare);
  }

  [compareLeft, compareRight].forEach((input) => {
    if (!input) return;
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        triggerCompare();
      }
    });
  });

  const peerChips = $("peer-chips");
  if (peerChips) {
    peerChips.addEventListener("click", (event) => {
      const btn = event.target.closest(".peer-chip");
      if (!btn || !state.ticker) return;
      const peer = btn.dataset.peer;
      if (!peer) return;
      goToCompare(state.ticker, peer);
    });
  }

  window.addEventListener("hashchange", render);
  render();
}

window.addEventListener("DOMContentLoaded", init);
