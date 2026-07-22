import { NextRequest, NextResponse } from "next/server";
import taiwanCompaniesData from "./taiwan-companies.json";

export const dynamic = "force-dynamic";

type SearchQuote = {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchange?: string;
};

type TaiwanCompany = {
  code: string;
  name: string;
  abbreviation: string;
  market: "TW" | "TWO";
};

const taiwanCompanies = taiwanCompaniesData as TaiwanCompany[];

function normalizeQuery(value: string) {
  const query = value.trim();
  if (/^\d{4,6}$/.test(query)) return `${query}.TW`;
  return query;
}

async function getLiveQuote(symbol: string) {
  const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
  const response = await fetch(endpoint, {
    headers: { "User-Agent": "Mozilla/5.0 Stocknote/1.0" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const json = await response.json() as {
    chart?: { result?: Array<{ meta?: { symbol?: string; regularMarketPrice?: number; regularMarketTime?: number; shortName?: string; longName?: string; currency?: string; exchangeName?: string } }> };
  };
  return json.chart?.result?.[0]?.meta ?? null;
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("q")?.trim();
  if (!raw) return NextResponse.json({ error: "請輸入股票名稱或代號" }, { status: 400 });

  try {
    const normalized = normalizeQuery(raw);
    let result: SearchQuote | undefined;

    const baseCode = normalized.replace(/\.(TW|TWO)$/i, "");
    const localCompany = taiwanCompanies.find((company) => company.code === baseCode)
      ?? taiwanCompanies.find((company) => company.abbreviation === raw || company.name === raw)
      ?? taiwanCompanies.find((company) => company.abbreviation.includes(raw) || company.name.includes(raw));

    if (localCompany?.code) {
      result = {
        symbol: `${localCompany.code}.${localCompany.market}`,
        shortname: localCompany.abbreviation,
        longname: localCompany.name,
        quoteType: "EQUITY",
      };
    }

    if (!result && /^[A-Z0-9.^=-]+$/i.test(normalized)) {
      result = { symbol: normalized.toUpperCase() };
    } else if (!result) {
      const searchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(raw)}&quotesCount=10&newsCount=0`;
      const response = await fetch(searchUrl, { headers: { "User-Agent": "Mozilla/5.0 Stocknote/1.0" }, cache: "no-store" });
      if (!response.ok) throw new Error("search provider error");
      const search = await response.json() as { quotes?: SearchQuote[] };
      result = search.quotes?.find((item) => item.symbol && ["EQUITY", "ETF"].includes(item.quoteType ?? "") && (item.symbol.endsWith(".TW") || item.symbol.endsWith(".TWO")))
        ?? search.quotes?.find((item) => item.symbol && ["EQUITY", "ETF"].includes(item.quoteType ?? ""));
    }

    if (!result?.symbol) return NextResponse.json({ error: "找不到符合的股票" }, { status: 404 });
    const quote = await getLiveQuote(result.symbol);
    if (!quote?.regularMarketPrice) return NextResponse.json({ error: "找到股票，但目前沒有可用報價" }, { status: 404 });

    const symbol = quote.symbol || result.symbol;
    const isTaiwan = symbol.endsWith(".TW") || symbol.endsWith(".TWO");
    const exchangeQuote = !isTaiwan && quote.currency === "USD" ? await getLiveQuote("TWD=X") : null;
    return NextResponse.json({
      symbol,
      name: isTaiwan ? (result.shortname || result.longname || quote.shortName || symbol) : (result.longname || result.shortname || quote.longName || quote.shortName || symbol),
      price: quote.regularMarketPrice,
      quoteTime: quote.regularMarketTime ? new Date(quote.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
      currency: quote.currency === "USD" ? "USD" : isTaiwan ? "TWD" : quote.currency,
      exchangeRate: exchangeQuote?.regularMarketPrice,
      exchange: quote.exchangeName || result.exchange,
      source: "Yahoo Finance",
    });
  } catch {
    return NextResponse.json({ error: "股票搜尋或即時報價服務暫時無法使用" }, { status: 502 });
  }
}
