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

const MOCK = {
  ticker: "BRK.B",
  name: "Berkshire Hathaway",
  price: 503.82,
  lastUpdated: "Daily",
  metrics: {
    grossMargin: 23.3,
    sgaEfficiency: 29.6,
    rdReliance: 0.0,
    netMargin: 24.0,
    consistentEarnings: 9,
    consistentEarningsYears: 10,
    interestCoverage: 11.4,
    debtToEquity: 0.22,
    roe: 13.7,
    capexEfficiency: 21.3,
    dollarTest: 3.69,
  },
  snapshots: {
    shareholderYield: 9.8,
    solvency: "Safe",
    altmanZ: 3.01,
  },
  valuation: {
    dcf: { low: 320, base: 480, high: 640 },
    graham: 520,
    lynch: 619,
    impliedGrowth: 28.0,
    current: 503.82,
  },
};

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
  ticker: "BRK.B",
  data: MOCK,
};

const $ = (id) => document.getElementById(id);

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

  const score = checks.reduce((sum, c) => sum + (c.pass ? 1 : 0), 0);
  let verdict = "Weak";
  if (score >= 8) verdict = "Strong";
  else if (score >= 5) verdict = "Mixed";

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
  $("hero-score").textContent = `${score}/10`;
  const mos = marginOfSafety(data.valuation);
  $("hero-mos").textContent = mos === null ? "—" : `${mos.toFixed(1)}%`;
  $("hero-solvency").textContent = data.snapshots.solvency;
  $("hero-yield").textContent =
    data.snapshots.shareholderYield === null
      ? "—"
      : `${data.snapshots.shareholderYield}%`;
  $("hero-updated").textContent = data.lastUpdated;
  document.querySelector(".hero-card__meta").textContent = `Sample: ${data.ticker} · ${verdict}`;
}

function renderAnalyzer(data) {
  $("analyzer-title").textContent = `${data.ticker} · Analyzer`;
  $("analyzer-updated").textContent = data.lastUpdated;

  const { score, verdict, checks } = scoreChecklist(data.metrics);
  $("final-score").textContent = `${score}/10`;
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

  const memo = [
    `Executive Summary`,
    `${data.name} (${data.ticker}) scores ${score}/10 on the Value Check. The score suggests a ${verdict.toLowerCase()} profile${mos === null ? "." : `, with a margin of safety around ${mos.toFixed(1)}%.`}`,
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
    <p><strong>${score}/10</strong> · ${verdict}</p>
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
  if (!API_BASE) return MOCK;

  const response = await fetch(`${API_BASE}/stock/${ticker}`);
  if (!response.ok) throw new Error("Unable to fetch data");
  return response.json();
}

async function loadTicker(ticker) {
  try {
    const data = await fetchStock(ticker);
    state.ticker = ticker;
    state.data = data;
  } catch (err) {
    console.error(err);
    state.data = MOCK;
  }
}

async function render() {
  const { route, ticker } = parseHash();
  if (ticker) {
    await loadTicker(ticker);
  }

  setActiveRoute(route);
  renderHomeHero(state.data);
  if (route === "analyzer") renderAnalyzer(state.data);
  if (route === "valuation") renderValuation(state.data);
  if (route === "memo") renderMemo(state.data);
  if (route === "snapshot") renderSnapshot(state.data);
}

function init() {
  renderTrending();
  renderHomeHero(state.data);

  $("ticker-go").addEventListener("click", () => {
    const value = $("ticker-input").value.trim().toUpperCase();
    if (!value) return;
    goTo("analyzer", value);
  });

  $("nav-search").addEventListener("click", () => {
    document.getElementById("ticker-input").focus();
    goTo("home");
  });

  window.addEventListener("hashchange", render);
  render();
}

window.addEventListener("DOMContentLoaded", init);
