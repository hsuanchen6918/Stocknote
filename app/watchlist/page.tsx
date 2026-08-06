"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type MarketState = "open" | "closed" | "unknown";

type WatchItem = {
  id: string;
  symbol: string;
  name: string;
  price: number;
  previousClose?: number;
  currency: string;
  exchange?: string;
  quoteTime?: string;
  fetchedAt?: string;
  marketState?: MarketState;
};

type QuoteResponse = Omit<WatchItem, "id"> & { error?: string };

type SyncUser = { id: string; email?: string; name?: string };
type CloudResponse = { watchlist?: WatchItem[]; exists?: boolean; updatedAt?: string; error?: string };

const STORAGE_KEY = "stocknote-watchlist";
const REFRESH_INTERVAL = 60_000;

function formatPrice(value: number, currency: string) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "TWD",
    minimumFractionDigits: currency === "USD" ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTime(value?: string) {
  if (!value) return "等待報價";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZone: "Asia/Taipei",
  }).format(new Date(value));
}

function changeOf(item: WatchItem) {
  const base = item.previousClose;
  if (!base) return { amount: 0, percent: 0, available: false };
  const amount = item.price - base;
  return { amount, percent: amount / base * 100, available: true };
}

function identityToSyncUser(user: { id?: string; email?: string; name?: string; userMetadata?: Record<string, unknown> } | null): SyncUser | null {
  if (!user?.id) return null;
  const metadataName = typeof user.userMetadata?.full_name === "string" ? user.userMetadata.full_name : undefined;
  return { id: user.id, email: user.email, name: user.name || metadataName };
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [syncUser, setSyncUser] = useState<SyncUser | null>(null);
  const [syncStatus, setSyncStatus] = useState<"checking" | "signed-out" | "loading" | "syncing" | "synced" | "error">("checking");
  const [syncMessage, setSyncMessage] = useState("檢查雲端同步狀態…");
  const itemsRef = useRef<WatchItem[]>([]);
  const hasLocalSavedRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const localItems = JSON.parse(saved) as WatchItem[];
        setItems(localItems);
        hasLocalSavedRef.current = localItems.length > 0;
      } catch { localStorage.removeItem(STORAGE_KEY); }
    }
    setReady(true);
  }, []);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }, [items, ready]);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const identity = await import("@netlify/identity");
          const callbackResult = await identity.handleAuthCallback().catch(() => null);
          const currentUser = callbackResult?.user ?? (await identity.getUser());
          if (!active) return;
          const user = identityToSyncUser(currentUser);
          setSyncUser(user);
          setSyncStatus(user ? "loading" : "signed-out");
          setSyncMessage(user ? "正在讀取雲端自選清單…" : "登入 Google 後可跨裝置同步自選清單。");
          unsubscribe = identity.onAuthChange((_event, nextUser) => {
            const normalized = identityToSyncUser(nextUser);
            setSyncUser(normalized);
            setSyncStatus(normalized ? "loading" : "signed-out");
            setSyncMessage(normalized ? "正在讀取雲端自選清單…" : "登入 Google 後可跨裝置同步自選清單。");
          });
        } catch {
          if (!active) return;
          setSyncStatus("error");
          setSyncMessage("請先在 Netlify 啟用 Identity，才能使用雲端同步。");
        }
      })();
    }, 0);
    return () => { active = false; window.clearTimeout(timer); unsubscribe?.(); };
  }, []);

  const saveWatchlistToCloud = useCallback(async (rows: WatchItem[], visible = false) => {
    if (!syncUser) return false;
    if (visible) { setSyncStatus("syncing"); setSyncMessage("正在同步自選清單…"); }
    try {
      const response = await fetch("/api/watchlist", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ watchlist: rows }) });
      const data = await response.json() as CloudResponse;
      if (!response.ok) throw new Error(data.error || "自選清單同步失敗");
      setSyncStatus("synced");
      setSyncMessage("自選清單已同步到雲端。");
      return true;
    } catch (error) {
      setSyncStatus("error");
      setSyncMessage(error instanceof Error ? error.message : "自選清單同步失敗，請稍後再試。");
      return false;
    }
  }, [syncUser]);

  const loadWatchlistFromCloud = useCallback(async () => {
    if (!ready || !syncUser) return;
    setSyncStatus("loading");
    setSyncMessage("正在讀取雲端自選清單…");
    try {
      const response = await fetch("/api/watchlist", { cache: "no-store", credentials: "include" });
      const data = await response.json() as CloudResponse;
      if (!response.ok) throw new Error(data.error || "讀取雲端自選清單失敗");
      if (data.exists) {
        const rows = Array.isArray(data.watchlist) ? data.watchlist : [];
        setItems(rows);
        setSyncStatus("synced");
        setSyncMessage(data.updatedAt ? `已讀取雲端自選清單（${formatTime(data.updatedAt)}）` : "已讀取雲端自選清單。");
        return;
      }
      if (hasLocalSavedRef.current && itemsRef.current.length) {
        await saveWatchlistToCloud(itemsRef.current);
        setSyncMessage("已將這台裝置的自選清單匯入雲端。");
        return;
      }
      setItems([]);
      setSyncStatus("synced");
      setSyncMessage("雲端目前沒有自選股票，新增後會自動同步。");
    } catch (error) {
      setSyncStatus("error");
      setSyncMessage(error instanceof Error ? error.message : "讀取雲端自選清單失敗。");
    }
  }, [ready, saveWatchlistToCloud, syncUser]);

  useEffect(() => {
    if (!ready || !syncUser) return;
    const timer = window.setTimeout(() => void loadWatchlistFromCloud(), 0);
    return () => window.clearTimeout(timer);
  }, [loadWatchlistFromCloud, ready, syncUser]);

  async function signInWithGoogle() {
    setSyncStatus("checking");
    setSyncMessage("前往 Google 登入…");
    try { const { oauthLogin } = await import("@netlify/identity"); oauthLogin("google"); }
    catch { setSyncStatus("error"); setSyncMessage("請先在 Netlify 啟用 Google 登入。"); }
  }

  async function signOutSync() {
    try { const { logout } = await import("@netlify/identity"); await logout(); }
    finally { setSyncUser(null); setSyncStatus("signed-out"); setSyncMessage("已登出，自選清單暫存在此裝置。"); }
  }

  const fetchQuote = useCallback(async (value: string) => {
    const response = await fetch(`/api/lookup?q=${encodeURIComponent(value)}`, { cache: "no-store" });
    const data = await response.json() as QuoteResponse;
    if (!response.ok || !data.symbol || typeof data.price !== "number") throw new Error(data.error || "目前無法取得報價");
    return data;
  }, []);

  const refreshAll = useCallback(async (visible = true) => {
    const current = itemsRef.current;
    if (!current.length) return;
    if (visible) { setLoading("all"); setMessage(""); }
    const results = await Promise.allSettled(current.map((item) => fetchQuote(item.symbol)));
    setItems((rows) => rows.map((item) => {
      const index = current.findIndex((row) => row.id === item.id);
      const result = results[index];
      return result?.status === "fulfilled" ? { ...item, ...result.value, id: item.id } : item;
    }));
    if (visible) {
      const updated = results.filter((result) => result.status === "fulfilled").length;
      setMessage(`已更新 ${updated} / ${current.length} 檔股票`);
      setLoading(null);
    }
  }, [fetchQuote]);

  useEffect(() => {
    if (!ready || !items.length) return;
    const initial = window.setTimeout(() => void refreshAll(false), 0);
    const timer = window.setInterval(() => void refreshAll(false), REFRESH_INTERVAL);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [ready, items.length, refreshAll]);

  async function addItem(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading("add");
    setMessage("");
    try {
      const quote = await fetchQuote(query.trim());
      if (itemsRef.current.some((item) => item.symbol === quote.symbol)) {
        setMessage(`${quote.symbol} 已經在看盤清單中`);
        return;
      }
      const nextItems = [...itemsRef.current, { ...quote, id: crypto.randomUUID() }];
      setItems(nextItems);
      hasLocalSavedRef.current = true;
      void saveWatchlistToCloud(nextItems);
      setQuery("");
      setMessage(`已加入 ${quote.name || quote.symbol}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "新增股票失敗");
    } finally { setLoading(null); }
  }

  async function refreshOne(item: WatchItem) {
    setLoading(item.id);
    try {
      const quote = await fetchQuote(item.symbol);
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, ...quote, id: row.id } : row));
      setMessage(`${item.symbol} 已更新`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新失敗");
    } finally { setLoading(null); }
  }

  const openCount = items.filter((item) => item.marketState === "open").length;
  const latest = items.reduce((result, item) => !result || (item.fetchedAt || "") > result ? item.fetchedAt || result : result, "");

  return <main className="watch-page">
    <header className="topbar watch-topbar">
      <a className="brand" href="/"><span className="brand-mark">S</span><span>Stocknote</span></a>
      <nav aria-label="主要功能"><a href="/#portfolio">投資組合</a><a href="/#simulator">加碼試算</a><a className="active" href="/watchlist">即時看盤</a></nav>
      <div className={`sync-control watch-sync-control ${syncStatus}`.trim()}>
        {syncUser ? <><span title={syncUser.email || syncUser.name || "已登入"}>{syncUser.email || syncUser.name || "已登入"}</span><button type="button" onClick={() => void loadWatchlistFromCloud()} disabled={syncStatus === "loading" || syncStatus === "syncing"}>{syncStatus === "loading" || syncStatus === "syncing" ? "同步中…" : "同步"}</button><button type="button" onClick={() => void signOutSync()}>登出</button></> : <button type="button" onClick={() => void signInWithGoogle()} disabled={syncStatus === "checking"}>{syncStatus === "checking" ? "檢查中…" : "Google 同步登入"}</button>}
      </div>
      <div className="status"><span className="live-dot" /> {openCount ? `${openCount} 檔交易中` : "市場狀態"}<small>{latest ? `更新 ${formatTime(latest)}` : "每 1 分鐘更新"}</small></div>
    </header>

    <section className="watch-hero">
      <div><p className="eyebrow">LIVE WATCHLIST</p><h1>即時看盤</h1><p className="subtitle">建立自己的關注清單，台股與美股報價每分鐘自動更新。</p></div>
      <form className="watch-add" onSubmit={addItem}>
        <label htmlFor="watch-query">加入股票</label>
        <div><input id="watch-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="輸入 2330、台積電或 AAPL" autoComplete="off" /><button disabled={loading === "add"}>{loading === "add" ? "查詢中…" : "＋ 加入清單"}</button></div>
        <small>支援上市、上櫃台股名稱／代號與美股代號</small>
      </form>
    </section>

    <section className={`sync-banner watch-sync-banner ${syncStatus}`.trim()} aria-live="polite"><span>雲端同步</span><p>{syncMessage}</p></section>

    {message && <button className="notice watch-notice" onClick={() => setMessage("")}>{message}<span>×</span></button>}

    <section className="watch-board">
      <div className="watch-heading"><div><p className="eyebrow">MY WATCHLIST</p><h2>我的關注股票 <span>{items.length}</span></h2></div><button className="outline" disabled={loading === "all" || !items.length} onClick={() => void refreshAll()}>{loading === "all" ? "更新中…" : "全部更新"}</button></div>
      {items.length ? <div className="watch-grid">{items.map((item) => {
        const change = changeOf(item);
        const direction = change.amount > 0 ? "gain" : change.amount < 0 ? "loss" : "flat";
        return <article className="watch-card" key={item.id}>
          <div className="watch-card-head"><div><span className="watch-symbol">{item.symbol.replace(/\.(TW|TWO)$/, "")}</span><small>{item.exchange || (item.currency === "USD" ? "US" : "TW")}</small></div><span className={`market-tag ${item.marketState || "unknown"}`}>{item.marketState === "open" ? "交易中" : item.marketState === "closed" ? "已收盤" : "報價中"}</span></div>
          <h3>{item.name}</h3>
          <div className="watch-price"><strong>{formatPrice(item.price, item.currency)}</strong><span className={direction}>{change.available ? `${change.amount >= 0 ? "+" : ""}${change.amount.toFixed(2)}　${change.percent >= 0 ? "+" : ""}${change.percent.toFixed(2)}%` : "—"}</span></div>
          <div className="watch-meta"><span>昨收 <b>{item.previousClose ? formatPrice(item.previousClose, item.currency) : "—"}</b></span><span>報價時間 <b>{formatTime(item.quoteTime)}</b></span></div>
          <div className="watch-actions"><button onClick={() => void refreshOne(item)} disabled={loading === item.id}>{loading === item.id ? "更新中…" : "更新報價"}</button><button className="remove" onClick={() => { const nextItems = itemsRef.current.filter((row) => row.id !== item.id); setItems(nextItems); hasLocalSavedRef.current = true; void saveWatchlistToCloud(nextItems); }}>移除</button></div>
        </article>;
      })}</div> : <div className="watch-empty"><span>＋</span><h2>建立你的第一份看盤清單</h2><p>在上方輸入股票名稱或代號，報價查到後就會自動加入。</p></div>}
    </section>
  </main>;
}
