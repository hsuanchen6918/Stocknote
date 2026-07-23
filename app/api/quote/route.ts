import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type TradingPeriod = {
  start?: number;
  end?: number;
};

type ChartMeta = {
  regularMarketPrice?: number;
  regularMarketTime?: number;
  shortName?: string;
  longName?: string;
  currency?: string;
  currentTradingPeriod?: {
    regular?: TradingPeriod;
  };
};

function marketState(meta: ChartMeta) {
  const regular = meta.currentTradingPeriod?.regular;
  if (!regular?.start || !regular?.end) return "unknown";
  const now = Math.floor(Date.now() / 1000);
  return now >= regular.start && now <= regular.end ? "open" : "closed";
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol || !/^[A-Z0-9.^=-]+$/.test(symbol)) return NextResponse.json({ error: "股票代號格式不正確" }, { status: 400 });
  try {
    const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
    const response = await fetch(endpoint, { headers: { "User-Agent": "Mozilla/5.0 Stocknote/1.0" }, cache: "no-store" });
    if (!response.ok) throw new Error("quote provider error");
    const json = await response.json() as { chart?: { result?: Array<{ meta?: ChartMeta }>; error?: unknown } };
    const meta = json.chart?.result?.[0]?.meta;
    if (typeof meta?.regularMarketPrice !== "number") return NextResponse.json({ error: "找不到此股票的市場報價" }, { status: 404 });
    return NextResponse.json({ symbol, price: meta.regularMarketPrice, name: meta.shortName || meta.longName || symbol, currency: meta.currency, quoteTime: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString(), fetchedAt: new Date().toISOString(), marketState: marketState(meta), source: "Yahoo Finance" });
  } catch {
    return NextResponse.json({ error: "即時報價服務暫時無法使用" }, { status: 502 });
  }
}
