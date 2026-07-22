import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol || !/^[A-Z0-9.^=-]+$/.test(symbol)) return NextResponse.json({ error: "股票代號格式不正確" }, { status: 400 });
  try {
    const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
    const response = await fetch(endpoint, { headers: { "User-Agent": "Mozilla/5.0 Stocknote/1.0" }, cache: "no-store" });
    if (!response.ok) throw new Error("quote provider error");
    const json = await response.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; shortName?: string; longName?: string; currency?: string } }>; error?: unknown } };
    const meta = json.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return NextResponse.json({ error: "找不到此股票的市場報價" }, { status: 404 });
    return NextResponse.json({ symbol, price: meta.regularMarketPrice, name: meta.shortName || meta.longName || symbol, currency: meta.currency, source: "Yahoo Finance" });
  } catch {
    return NextResponse.json({ error: "即時報價服務暫時無法使用" }, { status: 502 });
  }
}
