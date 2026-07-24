"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type MarketState = "open" | "closed" | "unknown";

type Holding = {
  id: string;
  symbol: string;
  name: string;
  shares: number;
  cost: number;
  price: number;
  currency: "TWD" | "USD";
  updatedAt?: string;
  quoteTime?: string;
  fetchedAt?: string;
  marketState?: MarketState;
  inputCost?: number;
  inputCostCurrency?: "TWD" | "USD";
  exchangeRate?: number;
  inputFee?: number;
  inputOtherFee?: number;
};

type QuoteLookup = {
  symbol?: string;
  name?: string;
  price?: number;
  currency?: string;
  quoteTime?: string;
  fetchedAt?: string;
  marketState?: MarketState;
  exchangeRate?: number;
  error?: string;
};

const seed: Holding[] = [
  { id: "demo-tsm", symbol: "2330.TW", name: "台積電", shares: 1000, cost: 920000, price: 1045, currency: "TWD" },
  { id: "demo-aapl", symbol: "AAPL", name: "Apple", shares: 12, cost: 2280, price: 218.27, currency: "USD" },
];

const REFRESH_INTERVAL_MS = 60_000;
const DELAY_WARNING_MS = 5 * 60_000;
const money = (value: number, currency: "TWD" | "USD", digits = 0) =>
  new Intl.NumberFormat("zh-TW", { style: "currency", currency, maximumFractionDigits: currency === "USD" ? Math.max(2, digits) : digits }).format(value || 0);
const number = (value: number) => new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 4 }).format(value || 0);
const pct = (value: number) => `${value >= 0 ? "+" : ""}${(value || 0).toFixed(2)}%`;
const quoteTime = (value?: string) => value ? new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Taipei" }).format(new Date(value)) : "尚未更新";
const enteredTotalCost = (item: Holding) => (item.inputCost ?? item.cost) + (item.inputFee || 0) + (item.inputOtherFee || 0);
const enteredCostCurrency = (item: Holding) => item.inputCostCurrency ?? item.currency;
const getQuoteTimestamp = (item: Holding) => item.quoteTime ?? item.updatedAt;

function isQuoteDelayed(quoteAt?: string, fetchedAt?: string, marketState?: MarketState) {
  if (!quoteAt || !fetchedAt || marketState === "closed") return false;
  const quoteMs = new Date(quoteAt).getTime();
  const fetchedMs = new Date(fetchedAt).getTime();
  return Number.isFinite(quoteMs) && Number.isFinite(fetchedMs) && fetchedMs - quoteMs > DELAY_WARNING_MS;
}

function quoteBadge(quoteAt?: string, fetchedAt?: string, marketState?: MarketState) {
  if (marketState === "closed") return "已收盤";
  if (isQuoteDelayed(quoteAt, fetchedAt, marketState)) return "報價可能延遲";
  return "";
}

function normalizeSymbol(value: string) {
  const symbol = value.trim().toUpperCase();
  if (/^\d{4,6}$/.test(symbol)) return `${symbol}.TW`;
  return symbol;
}

export default function Home() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState({ query: "", symbol: "", name: "", shares: "", cost: "", price: "", currency: "TWD" as "TWD" | "USD", costCurrency: "TWD" as "TWD" | "USD", exchangeRate: 0, quoteTime: "", fetchedAt: "", marketState: "unknown" as MarketState, hasFee: false, fee: "", hasOtherFee: false, otherFee: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [buyPrice, setBuyPrice] = useState("");
  const [buyShares, setBuyShares] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const holdingsRef = useRef<Holding[]>([]);

  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      const saved = localStorage.getItem("stocknote-holdings");
      const data = (saved ? JSON.parse(saved) as Holding[] : seed).map((item) => ({ ...item, quoteTime: item.quoteTime ?? item.updatedAt }));
      setHoldings(data);
      setSelectedId(data[0]?.id ?? "");
      setReady(true);
    }, 0);
    return () => window.clearTimeout(hydrateTimer);
  }, []);

  useEffect(() => {
    holdingsRef.current = holdings;
  }, [holdings]);

  useEffect(() => {
    if (ready) localStorage.setItem("stocknote-holdings", JSON.stringify(holdings));
  }, [holdings, ready]);

  const selected = holdings.find((item) => item.id === selectedId) ?? holdings[0];
  const simulation = useMemo(() => {
    if (!selected) return null;
    const extraShares = Number(buyShares) || 0;
    const extraPrice = Number(buyPrice) || 0;
    const shares = selected.shares + extraShares;
    const cost = selected.cost + extraShares * extraPrice;
    const marketValue = shares * selected.price;
    const profit = marketValue - cost;
    const target = Number(targetPrice) || 0;
    return { shares, cost, avg: shares ? cost / shares : 0, marketValue, profit, roi: cost ? profit / cost * 100 : 0, targetProfit: target ? shares * target - cost : 0 };
  }, [selected, buyPrice, buyShares, targetPrice]);

  async function resolveStock(query = form.query) {
    if (!query.trim()) return null;
    setLoading("lookup");
    setNotice("");
    try {
      const response = await fetch(`/api/lookup?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await response.json() as QuoteLookup;
      if (!response.ok || !data.symbol || !data.price) throw new Error(data.error || "找不到符合的股票");
      const resolved = { symbol: data.symbol, name: data.name || data.symbol, price: data.price, currency: data.currency === "USD" ? "USD" as const : "TWD" as const, quoteTime: data.quoteTime, fetchedAt: data.fetchedAt, marketState: data.marketState ?? "unknown" as MarketState, exchangeRate: data.exchangeRate || 0 };
      setForm((current) => ({ ...current, ...resolved, price: String(resolved.price), quoteTime: resolved.quoteTime ?? "", fetchedAt: resolved.fetchedAt ?? "", costCurrency: current.symbol ? current.costCurrency : resolved.currency }));
      setNotice(`已找到 ${resolved.name}（${resolved.symbol}），即時股價 ${money(resolved.price, resolved.currency, 2)}`);
      return resolved;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "股票搜尋失敗");
      return null;
    } finally { setLoading(null); }
  }

  function resetForm() {
    setEditingId(null);
    setForm({ query: "", symbol: "", name: "", shares: "", cost: "", price: "", currency: "TWD", costCurrency: "TWD", exchangeRate: 0, quoteTime: "", fetchedAt: "", marketState: "unknown", hasFee: false, fee: "", hasOtherFee: false, otherFee: "" });
  }

  function beginEdit(item: Holding) {
    setEditingId(item.id);
    setForm({
      query: item.symbol,
      symbol: item.symbol,
      name: item.name,
      shares: String(item.shares),
      cost: String(item.inputCost ?? item.cost),
      price: String(item.price),
      currency: item.currency,
      costCurrency: item.inputCostCurrency ?? item.currency,
      exchangeRate: item.exchangeRate ?? 0,
      quoteTime: getQuoteTimestamp(item) ?? "",
      fetchedAt: item.fetchedAt ?? "",
      marketState: item.marketState ?? "unknown",
      hasFee: Boolean(item.inputFee),
      fee: item.inputFee ? String(item.inputFee) : "",
      hasOtherFee: Boolean(item.inputOtherFee),
      otherFee: item.inputOtherFee ? String(item.inputOtherFee) : "",
    });
    setTimeout(() => document.getElementById("add")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function addHolding(event: React.FormEvent) {
    event.preventDefault();
    const shares = Number(form.shares);
    const stockCost = Number(form.cost);
    const fee = form.hasFee ? Number(form.fee) || 0 : 0;
    const otherFee = form.hasOtherFee ? Number(form.otherFee) || 0 : 0;
    if (!form.query.trim() || shares <= 0 || stockCost < 0) {
      setNotice("請輸入股票名稱或代號、股數與總成本");
      return;
    }
    const resolved = editingId && form.symbol && Number(form.price) ? { symbol: form.symbol, name: form.name, price: Number(form.price), currency: form.currency, quoteTime: form.quoteTime || undefined, fetchedAt: form.fetchedAt || undefined, marketState: form.marketState, exchangeRate: form.exchangeRate } : await resolveStock();
    if (!resolved) return;
    const needsConversion = resolved.currency === "USD" && form.costCurrency === "TWD";
    const rate = resolved.exchangeRate || form.exchangeRate;
    if (needsConversion && !rate) {
      setNotice("目前無法取得美元兌台幣匯率，請改用美元輸入總成本或稍後再試");
      return;
    }
    const totalInputCost = stockCost + fee + otherFee;
    const normalizedCost = needsConversion ? totalInputCost / rate : totalInputCost;
    const existing = holdings.find((item) => item.id === editingId);
    const quoteAt = resolved.quoteTime || existing?.quoteTime || existing?.updatedAt;
    const item: Holding = { id: editingId || crypto.randomUUID(), symbol: normalizeSymbol(resolved.symbol), name: resolved.name || resolved.symbol, shares, cost: normalizedCost, price: resolved.price, currency: resolved.currency, updatedAt: quoteAt, quoteTime: quoteAt, fetchedAt: resolved.fetchedAt || existing?.fetchedAt, marketState: resolved.marketState || existing?.marketState || "unknown", inputCost: stockCost, inputCostCurrency: form.costCurrency, exchangeRate: needsConversion ? rate : undefined, inputFee: fee || undefined, inputOtherFee: otherFee || undefined };
    setHoldings((items) => editingId ? items.map((row) => row.id === editingId ? item : row) : [...items, item]);
    setSelectedId(item.id);
    const wasEditing = Boolean(editingId);
    resetForm();
    setNotice(`${item.name} 已${wasEditing ? "更新" : "加入"}庫存${needsConversion ? `（以 1 USD = ${rate.toFixed(3)} TWD 換算）` : ""}`);
  }

  const refreshQuote = useCallback(async (item: Holding, options: { silent?: boolean } = {}) => {
    if (!options.silent) {
      setLoading(item.id);
      setNotice("");
    }
    try {
      const response = await fetch(`/api/lookup?q=${encodeURIComponent(item.symbol)}`, { cache: "no-store" });
      const data = await response.json() as QuoteLookup;
      if (!response.ok || !data.price) throw new Error(data.error || "目前無法取得報價");
      const now = new Date().toISOString();
      const quoteAt = data.quoteTime || now;
      setHoldings((items) => items.map((row) => row.id === item.id ? { ...row, price: data.price!, name: data.name || row.name, currency: data.currency === "USD" ? "USD" : row.currency, exchangeRate: data.exchangeRate || row.exchangeRate, updatedAt: quoteAt, quoteTime: quoteAt, fetchedAt: data.fetchedAt || now, marketState: data.marketState ?? "unknown" } : row));
      if (!options.silent) {
        const isSameQuote = quoteAt === getQuoteTimestamp(item) && data.price === item.price;
        const badge = quoteBadge(quoteAt, data.fetchedAt || now, data.marketState ?? "unknown");
        setNotice(isSameQuote ? `${item.symbol} 已檢查，資料源尚未提供更新報價${badge ? `（${badge}）` : ""}` : `${item.symbol} 已取得最新可用報價${badge ? `（${badge}）` : ""}`);
      }
    } catch (error) {
      if (!options.silent) setNotice(error instanceof Error ? `${error.message}，可直接點股價手動修改` : "報價更新失敗");
    } finally {
      if (!options.silent) setLoading(null);
    }
  }, []);

  const refreshAllQuotes = useCallback(async (options: { silent?: boolean } = {}) => {
    const rows = holdingsRef.current;
    if (!rows.length) return;
    if (!options.silent) {
      setLoading("all");
      setNotice("");
    }
    await Promise.all(rows.map((item) => refreshQuote(item, { silent: true })));
    if (!options.silent) {
      setLoading(null);
      setNotice(`已檢查 ${rows.length} 檔股票報價`);
    }
  }, [refreshQuote]);

  useEffect(() => {
    if (!ready) return;
    const firstRun = window.setTimeout(() => {
      void refreshAllQuotes({ silent: true });
    }, 0);
    const timer = window.setInterval(() => {
      void refreshAllQuotes({ silent: true });
    }, REFRESH_INTERVAL_MS);
    return () => {
      window.clearTimeout(firstRun);
      window.clearInterval(timer);
    };
  }, [ready, refreshAllQuotes]);

  function updatePrice(item: Holding) {
    const next = window.prompt(`更新 ${item.symbol} 股價`, String(item.price));
    if (next === null || Number(next) <= 0) return;
    const now = new Date().toISOString();
    setHoldings((items) => items.map((row) => row.id === item.id ? { ...row, price: Number(next), updatedAt: now, quoteTime: now, fetchedAt: now, marketState: "unknown" } : row));
  }

  const totalTwd = holdings.filter((h) => h.currency === "TWD").reduce((sum, h) => sum + h.price * h.shares, 0);
  const costTwd = holdings.filter((h) => h.currency === "TWD").reduce((sum, h) => sum + h.cost, 0);
  const profitTwd = holdings.filter((h) => h.currency === "TWD").reduce((sum, h) => sum + h.price * h.shares - h.cost, 0);
  const roiTwd = costTwd ? profitTwd / costTwd * 100 : 0;
  const twCount = holdings.filter((h) => h.currency === "TWD").length;
  const usTwdHoldings = holdings.filter((h) => h.currency === "USD" && h.inputCostCurrency === "TWD" && h.exchangeRate);
  const usUsdHoldings = holdings.filter((h) => h.currency === "USD" && h.inputCostCurrency !== "TWD");
  const totalUsTwd = usTwdHoldings.reduce((sum, h) => sum + h.price * h.shares * h.exchangeRate!, 0);
  const costUsTwd = usTwdHoldings.reduce((sum, h) => sum + enteredTotalCost(h), 0);
  const profitUsTwd = usTwdHoldings.reduce((sum, h) => sum + h.price * h.shares * h.exchangeRate! - enteredTotalCost(h), 0);
  const totalUsUsd = usUsdHoldings.reduce((sum, h) => sum + h.price * h.shares, 0);
  const costUsUsd = usUsdHoldings.reduce((sum, h) => sum + h.cost, 0);
  const profitUsUsd = usUsdHoldings.reduce((sum, h) => sum + h.price * h.shares - h.cost, 0);
  const roiUsTwd = costUsTwd ? profitUsTwd / costUsTwd * 100 : 0;
  const roiUsUsd = costUsUsd ? profitUsUsd / costUsUsd * 100 : 0;
  const delayedCount = holdings.filter((item) => isQuoteDelayed(getQuoteTimestamp(item), item.fetchedAt, item.marketState)).length;
  const closedCount = holdings.filter((item) => item.marketState === "closed").length;
  const allMarketsClosed = holdings.length > 0 && closedCount === holdings.length;
  const latestFetchedAt = holdings.reduce((latest, item) => {
    const current = item.fetchedAt ? new Date(item.fetchedAt).getTime() : 0;
    const previous = latest ? new Date(latest).getTime() : 0;
    return current > previous ? item.fetchedAt! : latest;
  }, "");
  const quoteSummary = !holdings.length ? "等待庫存" : allMarketsClosed ? "已收盤" : delayedCount ? "報價可能延遲" : "每 1 分鐘自動更新";
  const statusClass = allMarketsClosed ? "is-closed" : delayedCount ? "is-delayed" : "";

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark">S</span><span>Stocknote</span></a>
        <nav><a href="#portfolio">投資組合</a><a href="#simulator">加碼試算</a></nav>
        <div className={`status ${statusClass}`.trim()}><span className="live-dot" /> {quoteSummary}<small>{latestFetchedAt ? `檢查 ${quoteTime(latestFetchedAt)}` : "每 1 分鐘"}</small></div>
      </header>

      <section className="hero">
        <div><p className="eyebrow">庫存儀表板</p><h1>搶救錢包</h1><p className="subtitle">台股與美股庫存管理，即時報價，模擬持續買入計算報酬</p></div>
        <div className="market-pulse"><span>AUTO REFRESH</span><strong>{quoteSummary}</strong><i>{latestFetchedAt ? `檢查 ${quoteTime(latestFetchedAt)}` : "每 1 分鐘更新"}</i></div>
      </section>

      {notice && <button className="notice" onClick={() => setNotice("")} aria-label="關閉通知">{notice}<span>×</span></button>}

      <section className="summary-grid" aria-label="資產摘要">
        <article className="metric market-card tw-card">
          <div className="metric-title"><span className="market-icon" aria-hidden="true">🇹🇼</span><div><small>TAIWAN</small><b>台股庫存總覽</b></div></div>
          <div className="market-stats"><div><span>目前市值</span><strong>{money(totalTwd, "TWD")}</strong></div><div><span>未實現損益</span><strong className={profitTwd >= 0 ? "gain" : "loss"}>{money(profitTwd, "TWD")}</strong></div><div><span>未實現報酬率</span><strong className={roiTwd >= 0 ? "gain" : "loss"}>{pct(roiTwd)}</strong></div></div>
          <small className="metric-footnote">共 {twCount} 檔台股 · 依最新庫存股價計算</small>
        </article>
        <article className="metric market-card us-card">
          <div className="metric-title"><span className="market-icon" aria-hidden="true">🇺🇸</span><div><small>UNITED STATES</small><b>美股庫存總覽</b></div></div>
          <div className="market-stats"><div><span>目前市值</span><strong>{usTwdHoldings.length ? money(totalUsTwd, "TWD") : money(totalUsUsd, "USD")}</strong>{usTwdHoldings.length > 0 && usUsdHoldings.length > 0 && <small>另有 {money(totalUsUsd, "USD")}</small>}</div><div><span>未實現損益</span><strong className={(usTwdHoldings.length ? profitUsTwd : profitUsUsd) >= 0 ? "gain" : "loss"}>{usTwdHoldings.length ? money(profitUsTwd, "TWD") : money(profitUsUsd, "USD")}</strong>{usTwdHoldings.length > 0 && usUsdHoldings.length > 0 && <small className={profitUsUsd >= 0 ? "gain" : "loss"}>另有 {money(profitUsUsd, "USD")}</small>}</div><div><span>未實現報酬率</span><strong className={(usTwdHoldings.length ? roiUsTwd : roiUsUsd) >= 0 ? "gain" : "loss"}>{pct(usTwdHoldings.length ? roiUsTwd : roiUsUsd)}</strong>{usTwdHoldings.length > 0 && usUsdHoldings.length > 0 && <small className={roiUsUsd >= 0 ? "gain" : "loss"}>另有 {pct(roiUsUsd)}</small>}</div></div>
          <small className="metric-footnote">共 {usTwdHoldings.length + usUsdHoldings.length} 檔美股 · 依成本幣別分開計價</small>
        </article>
        <article className="metric action-card"><span className="action-icon" aria-hidden="true">＋</span><span>快速操作</span><strong>新增一筆庫存</strong><a href="#add">開始輸入 <b>→</b></a></article>
      </section>

      <section id="portfolio" className="section-block">
        <div className="section-heading"><div><p className="eyebrow">01 / PORTFOLIO</p><h2>我的股票庫存</h2></div><button className="outline" disabled={loading === "all"} onClick={() => void refreshAllQuotes()}>{loading === "all" ? "更新中…" : "↻ 全部更新報價"}</button></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>標的</th><th>庫存股數</th><th>平均成本</th><th>目前股價</th><th>目前市值</th><th>未實現損益</th><th>報酬率</th><th /></tr></thead>
            <tbody>
              {holdings.map((item) => {
                const value = item.shares * item.price;
                const profit = value - item.cost;
                const showMarketInTwd = item.currency === "USD" && item.inputCostCurrency === "TWD" && Boolean(item.exchangeRate);
                const displayCurrency = showMarketInTwd ? "TWD" : item.currency;
                const displayValue = showMarketInTwd ? value * item.exchangeRate! : value;
                const displayProfit = showMarketInTwd ? displayValue - enteredTotalCost(item) : profit;
                const roiCost = showMarketInTwd ? enteredTotalCost(item) : item.cost;
                const roi = roiCost ? displayProfit / roiCost * 100 : 0;
                const itemQuoteTime = getQuoteTimestamp(item);
                const itemQuoteBadge = quoteBadge(itemQuoteTime, item.fetchedAt, item.marketState);
                return <tr key={item.id} className={selected?.id === item.id ? "selected" : ""} onClick={() => setSelectedId(item.id)}>
                  <td><div className="stock-name"><span>{item.symbol.replace(/\.(TW|TWO)$/, "")}</span><small>{item.name} · {item.currency}</small></div></td>
                  <td>{number(item.shares)}</td><td>{money(item.cost / item.shares, item.currency, 2)}<small className="quote-time">總成本 {money(enteredTotalCost(item), enteredCostCurrency(item))}</small>{(item.inputFee || item.inputOtherFee) && <small className="quote-time">含費用 {money((item.inputFee || 0) + (item.inputOtherFee || 0), enteredCostCurrency(item))}</small>}{showMarketInTwd && <small className="quote-time">市值依匯率 {item.exchangeRate!.toFixed(3)} 換算</small>}</td>
                  <td><button className="price-button" onClick={(e) => { e.stopPropagation(); updatePrice(item); }}>{money(item.price, item.currency, 2)}</button><small className="quote-time">最新報價時間 {quoteTime(itemQuoteTime)}</small><small className="quote-time">本次檢查時間 {quoteTime(item.fetchedAt)}</small>{itemQuoteBadge && <span className={`quote-badge ${item.marketState === "closed" ? "closed" : "delayed"}`}>{itemQuoteBadge}</span>}</td>
                  <td>{money(displayValue, displayCurrency)}</td><td className={displayProfit >= 0 ? "gain" : "loss"}>{money(displayProfit, displayCurrency)}</td>
                  <td><span className={`pill ${roi >= 0 ? "up" : "down"}`}>{pct(roi)}</span></td>
                  <td><button className="refresh" disabled={loading === item.id || loading === "all"} onClick={(e) => { e.stopPropagation(); refreshQuote(item); }} aria-label={`更新 ${item.symbol} 報價`}>{loading === item.id ? "…" : "↻"}</button><button className="edit" onClick={(e) => { e.stopPropagation(); beginEdit(item); }} aria-label={`編輯 ${item.symbol}`}>✎</button><button className="delete" onClick={(e) => { e.stopPropagation(); setHoldings((rows) => rows.filter((row) => row.id !== item.id)); }}>×</button></td>
                </tr>;
              })}
              {!holdings.length && <tr><td colSpan={8} className="empty">還沒有庫存，從下方新增第一筆。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="workbench">
        <form id="add" className="panel add-panel" onSubmit={addHolding}>
          <div className="panel-title"><span>{editingId ? "✎" : "＋"}</span><div><p className="eyebrow">{editingId ? "EDIT HOLDING" : "新增資料"}</p><h2>{editingId ? "編輯股票庫存" : "輸入現有庫存"}</h2></div>{editingId && <button className="cancel-edit" type="button" onClick={resetForm}>取消編輯</button>}</div>
          <label>股票名稱或代號（二擇一）<div className="lookup-row"><input value={form.query} onChange={(e) => setForm({ ...form, query: e.target.value, symbol: "", name: "", price: "", quoteTime: "", fetchedAt: "", marketState: "unknown" })} onBlur={() => { if (form.query && !form.symbol) void resolveStock(); }} placeholder="例如：台積電、2330、Apple 或 AAPL" /><button type="button" onClick={() => void resolveStock()} disabled={loading === "lookup"}>{loading === "lookup" ? "搜尋中…" : "搜尋即時股價"}</button></div><small>輸入其中一項後，系統會自動對應股票名稱、代號、幣別及最新價格</small></label>
          {form.symbol && form.price && <div className="lookup-result"><div><span>已辨識股票</span><strong>{form.name}</strong><small>{form.symbol} · {form.currency}</small><small>最新報價時間 {quoteTime(form.quoteTime)}</small></div><div><span>最新市場價格</span><strong>{money(Number(form.price), form.currency, 2)}</strong><small>{form.currency === "USD" && form.exchangeRate ? `匯率 1 USD = ${form.exchangeRate.toFixed(3)} TWD` : "加入時會再確認一次"}</small><small>本次檢查時間 {quoteTime(form.fetchedAt)}</small>{quoteBadge(form.quoteTime, form.fetchedAt, form.marketState) && <small className="lookup-warning">{quoteBadge(form.quoteTime, form.fetchedAt, form.marketState)}</small>}</div></div>}
          <div className="two-col"><label>庫存股數<input type="number" min="0" step="any" value={form.shares} onChange={(e) => setForm({ ...form, shares: e.target.value })} placeholder="1000" /></label><label>買入股票成本（未含費用）<div className="cost-input-row"><input type="number" min="0" step="any" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder={form.costCurrency === "TWD" ? "例如 920000" : "例如 2280"} />{form.currency === "USD" ? <select aria-label="成本幣別" value={form.costCurrency} onChange={(e) => setForm({ ...form, costCurrency: e.target.value as "TWD" | "USD" })}><option value="USD">美元 USD</option><option value="TWD">台幣 TWD</option></select> : <span>台幣 TWD</span>}</div>{form.currency === "USD" && form.costCurrency === "TWD" && <small>總成本與平均成本會維持以台幣顯示；系統僅在計算美股損益時使用匯率換算。</small>}</label></div>
          <div className="fees-box"><label className="fee-toggle"><input type="checkbox" checked={form.hasFee} onChange={(e) => setForm({ ...form, hasFee: e.target.checked })} />有手續費</label><label className="fee-toggle"><input type="checkbox" checked={form.hasOtherFee} onChange={(e) => setForm({ ...form, hasOtherFee: e.target.checked })} />有其他費用</label></div>
          {(form.hasFee || form.hasOtherFee) && <div className="two-col fee-inputs">{form.hasFee && <label>手續費<input type="number" min="0" step="any" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} placeholder="0" /></label>}{form.hasOtherFee && <label>其他費用（稅、平台費等）<input type="number" min="0" step="any" value={form.otherFee} onChange={(e) => setForm({ ...form, otherFee: e.target.value })} placeholder="0" /></label>}</div>}
          <small className="cost-hint">平均成本、損益與報酬率會自動納入所有勾選的費用。</small>
          <button className="primary-button" type="submit" disabled={loading === "lookup"}>{loading === "lookup" ? "正在取得市場報價…" : editingId ? "儲存庫存修改" : "抓取即時股價並加入投資組合"} <span>→</span></button>
        </form>

        <section id="simulator" className="panel simulator-panel">
          <div className="panel-title"><span>↗</span><div><p className="eyebrow">HOW TO搶救錢包?</p><h2>持續買入試算</h2></div></div>
          {selected && simulation ? <>
            <label>選擇庫存<select value={selected.id} onChange={(e) => setSelectedId(e.target.value)}>{holdings.map((h) => <option key={h.id} value={h.id}>{h.symbol} · {h.name}</option>)}</select></label>
            <div className="current-line"><span>目前 {number(selected.shares)} 股</span><span>平均 {money(selected.cost / selected.shares, selected.currency, 2)}</span><span>現價 {money(selected.price, selected.currency, 2)}</span></div>
            <div className="two-col"><label>預計買入股價<input type="number" min="0" step="any" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} placeholder={String(selected.price)} /></label><label>預計買入數量<input type="number" min="0" step="any" value={buyShares} onChange={(e) => setBuyShares(e.target.value)} placeholder="100" /></label></div>
            <div className="result-card"><p>加碼後試算</p><div className="result-main"><span>新平均成本</span><strong>{money(simulation.avg, selected.currency, 2)}</strong></div><div className="result-grid"><div><span>總股數</span><b>{number(simulation.shares)}</b></div><div><span>總成本</span><b>{money(simulation.cost, selected.currency)}</b></div><div><span>目前損益</span><b className={simulation.profit >= 0 ? "gain" : "loss"}>{money(simulation.profit, selected.currency)}</b></div><div><span>報酬率</span><b className={simulation.roi >= 0 ? "gain" : "loss"}>{pct(simulation.roi)}</b></div></div></div>
            <div className="target-box"><label>預期未來股價<input type="number" min="0" step="any" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} placeholder="輸入目標價" /></label><div><span>到價預期損益</span><strong className={simulation.targetProfit >= 0 ? "gain" : "loss"}>{targetPrice ? money(simulation.targetProfit, selected.currency) : "—"}</strong><small>以加碼後總股數及總成本計算</small></div></div>
          </> : <div className="empty simulator-empty">請先新增一筆庫存，再進行加碼試算。</div>}
        </section>
      </section>

      <footer><span>STOCKNOTE / 個人投資計算工具</span><p>報價可能延遲，資料僅供參考，不構成投資建議。資料儲存在此裝置。</p></footer>
    </main>
  );
}
