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

function emptyData(ticker = "") {
  return {
    ticker,
    name: "",
    price: null,
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
  "valuation",
  "memo",
  "snapshot",
  "methodology",
  "support",
];

const state = {
  ticker: "",
  data: emptyData(""),
  error: null,
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
  container.innerHTML = "";
  suggestionsState.items = list;
  suggestionsState.open = list.length > 0;
  container.classList.toggle("is-active", list.length > 0);

  list.forEach((item) => {
    const row = document.createElement("div");
    row.className = "suggestion-item";
    row.innerHTML = `
      <span class="suggestion-ticker">${item.ticker}</span>
      <span class="suggestion-title">${item.title || ""}</span>
    `;
    row.addEventListener("click", () => {
      const input = $("ticker-input");
      if (input) input.value = item.ticker;
      container.classList.remove("is-active");
      suggestionsState.open = false;
      goTo("analyzer", item.ticker);
    });
    container.appendChild(row);
  });
}

function closeSuggestions() {
  const container = $("search-suggestions");
  if (!container) return;
  container.classList.remove("is-active");
  suggestionsState.open = false;
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
  if (ticker) {
    window.location.hash = `#/${route}/${encodeURIComponent(ticker)}`;
  } else {
    window.location.hash = `#/${route}`;
  }
}

function scoreChecklist(metrics) {
  const checks = [
    {
      label: "Gross Margin > 40%",
      value: formatValue(metrics.grossMargin, "%"),
      pass: metrics.grossMargin !== null && metrics.grossMargin > 40,
    },
    {
      label: "SG&A Efficiency < 30%",
      value: formatValue(metrics.sgaEfficiency, "%"),
      pass: metrics.sgaEfficiency !== null && metrics.sgaEfficiency < 30,
    },
    {
      label: "R&D Reliance < 30%",
      value: formatValue(metrics.rdReliance, "%"),
      pass: metrics.rdReliance !== null && metrics.rdReliance < 30,
    },
    {
      label: "Net Margin > 20%",
      value: formatValue(metrics.netMargin, "%"),
      pass: metrics.netMargin !== null && metrics.netMargin > 20,
    },
    {
      label: "Consistent Earnings (all yrs)",
      value: metrics.consistentEarningsYears
        ? `${metrics.consistentEarnings}/${metrics.consistentEarningsYears} yrs`
        : "—",
      pass:
        metrics.consistentEarningsYears &&
        metrics.consistentEarningsYears >= 5 &&
        metrics.consistentEarnings === metrics.consistentEarningsYears,
    },
    {
      label: "Interest Coverage > 6x",
      value: metrics.interestCoverage !== null ? `${metrics.interestCoverage}x` : "—",
      pass: metrics.interestCoverage !== null && metrics.interestCoverage > 6,
    },
    {
      label: "Debt / Equity < 0.5",
      value: formatValue(metrics.debtToEquity),
      pass: metrics.debtToEquity !== null && metrics.debtToEquity < 0.5,
    },
    {
      label: "ROE > 15%",
      value: formatValue(metrics.roe, "%"),
      pass: metrics.roe !== null && metrics.roe > 15,
    },
    {
      label: "Capex Efficiency < 50%",
      value: formatValue(metrics.capexEfficiency, "%"),
      pass: metrics.capexEfficiency !== null && metrics.capexEfficiency < 50,
    },
    {
      label: "$1 Test > 1.0",
      value: formatValue(metrics.dollarTest),
      pass: metrics.dollarTest !== null && metrics.dollarTest > 1,
    },
  ];

  const hasData = checks.some((c) => c.value !== "—");
  const score = hasData ? checks.reduce((sum, c) => sum + (c.pass ? 1 : 0), 0) : null;
  let verdict = hasData ? "Weak" : "Unavailable";
  if (score !== null && score >= 8) verdict = "Strong";
  else if (score !== null && score >= 5) verdict = "Mixed";

  return { score, verdict, checks };
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

function renderHomeHero(data) {
  const { score, verdict } = scoreChecklist(data.metrics);
  $("hero-score").textContent = score === null ? "—" : `${score}/10`;
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
  $("analyzer-title").textContent = `${data.ticker} · Analyzer`;
  $("analyzer-updated").textContent = data.lastUpdated;

  const { score, verdict, checks } = scoreChecklist(data.metrics);
  $("final-score").textContent = score === null ? "—" : `${score}/10`;
  $("final-verdict").textContent = verdict;

  const table = $("checklist-table");
  table.innerHTML = "";
  checks.forEach((check) => {
    const row = document.createElement("div");
    row.className = "table-row";

    const label = document.createElement("div");
    label.textContent = check.label;

    const value = document.createElement("div");
    value.textContent = check.value;

    const result = document.createElement("div");
    result.className = `result ${check.pass ? "pass" : "fail"}`;
    result.textContent = check.pass ? "Pass" : "Fail";

    row.append(label, value, result);
    table.appendChild(row);
  });

  const snapshot = $("snapshot-grid");
  snapshot.innerHTML = "";
  const items = [
    {
      label: "Shareholder Yield",
      value:
        data.snapshots.shareholderYield === null
          ? "—"
          : `${data.snapshots.shareholderYield}% returned`,
    },
    { label: "Solvency", value: data.snapshots.solvency },
    { label: "Altman Z-Score", value: data.snapshots.altmanZ ?? "—" },
    { label: "Debt/Equity", value: data.metrics.debtToEquity ?? "—" },
  ];

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "snapshot-card";
    card.innerHTML = `<span class="muted">${item.label}</span><strong>${item.value}</strong>`;
    snapshot.appendChild(card);
  });

  $("to-valuation").onclick = () => goTo("valuation", data.ticker);
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
  const { score, verdict } = scoreChecklist(data.metrics);
  const mos = marginOfSafety(data.valuation);
  const companyName = data.name || data.ticker || "this company";

  const memo = [
    `Executive Summary`,
    score === null
      ? `Data is not available yet for ${companyName}. Try again later.`
      : `${companyName} (${data.ticker}) scores ${score}/10 on the Value Check. The score suggests a ${verdict.toLowerCase()} profile${mos === null ? "." : `, with a margin of safety around ${mos.toFixed(1)}%.`}`,
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
  const { score, verdict } = scoreChecklist(data.metrics);
  const mos = marginOfSafety(data.valuation);

  $("snapshot-content").innerHTML = `
    <h3>Value Check Final Score</h3>
    <p><strong>${score === null ? "—" : `${score}/10`}</strong> · ${verdict}</p>
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

  const response = await fetch(`${API_BASE}/stock/${ticker}`);
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

async function render() {
  const { route, ticker } = parseHash();
  const needsTicker = ["analyzer", "valuation", "memo", "snapshot"].includes(route);

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
    await loadTicker(ticker);
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

    tickerInput.addEventListener("blur", () => {
      setTimeout(closeSuggestions, 150);
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

  window.addEventListener("hashchange", render);
  render();
}

window.addEventListener("DOMContentLoaded", init);
