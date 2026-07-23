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

type TradingPeriod = {
  start?: number;
  end?: number;
};

type ChartMeta = {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketTime?: number;
  shortName?: string;
  longName?: string;
  currency?: string;
  exchangeName?: string;
  currentTradingPeriod?: {
    regular?: TradingPeriod;
  };
};

type TaiwanMisItem = {
  a?: string;
  b?: string;
  c?: string;
  d?: string;
  ex?: string;
  n?: string;
  nf?: string;
  pz?: string;
  t?: string;
  tlong?: string;
  y?: string;
  z?: string;
};

type TaiwanMisResponse = {
  rtcode?: string;
  msgArray?: TaiwanMisItem[];
};

const taiwanCompanies = taiwanCompaniesData as TaiwanCompany[];

function normalizeQuery(value: string) {
  const query = value.trim();
  if (/^\d{4,6}$/.test(query)) return `${query}.TW`;
  return query;
}

async function getYahooQuote(symbol: string) {
  const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
  const response = await fetch(endpoint, {
    headers: { "User-Agent": "Mozilla/5.0 Stocknote/1.0" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const json = await response.json() as {
    chart?: { result?: Array<{ meta?: ChartMeta }> };
  };
  return json.chart?.result?.[0]?.meta ?? null;
}

function parseMarketNumber(value?: string) {
  const normalized = value?.trim().replace(/,/g, "");
  if (!normalized || normalized === "-" || normalized === "_") return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function firstQuoteLevel(value?: string) {
  return value?.split("_").map(parseMarketNumber).find((price) => typeof price === "number");
}

function taiwanCurrentPrice(item: TaiwanMisItem) {
  const lastTrade = parseMarketNumber(item.z) ?? parseMarketNumber(item.pz);
  if (typeof lastTrade === "number") return lastTrade;
  const bestAsk = firstQuoteLevel(item.a);
  const bestBid = firstQuoteLevel(item.b);
  if (typeof bestAsk === "number" && typeof bestBid === "number") return (bestAsk + bestBid) / 2;
  return bestBid ?? bestAsk ?? parseMarketNumber(item.y);
}

function parseTaiwanQuoteTime(item: TaiwanMisItem) {
  const epochMs = Number(item.tlong);
  if (Number.isFinite(epochMs) && epochMs > 0) return new Date(epochMs).toISOString();
  if (item.d && item.t && /^\d{8}$/.test(item.d)) {
    const year = item.d.slice(0, 4);
    const month = item.d.slice(4, 6);
    const day = item.d.slice(6, 8);
    return new Date(`${year}-${month}-${day}T${item.t}+08:00`).toISOString();
  }
  return new Date().toISOString();
}

function taiwanMarketState(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = value("weekday");
  if (weekday === "Sat" || weekday === "Sun") return "closed";
  const minutes = Number(value("hour")) * 60 + Number(value("minute"));
  return minutes >= 9 * 60 && minutes <= 13 * 60 + 30 ? "open" : "closed";
}

async function getTaiwanQuote(company: TaiwanCompany) {
  const exchange = company.market === "TWO" ? "otc" : "tse";
  const endpoint = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${exchange}_${company.code}.tw&json=1&delay=0`;
  const response = await fetch(endpoint, {
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Referer": "https://mis.twse.com.tw/stock/index.jsp",
      "User-Agent": "Mozilla/5.0 Stocknote/1.0",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const json = await response.json() as TaiwanMisResponse;
  const item = json.msgArray?.find((quote) => quote.c === company.code) ?? json.msgArray?.[0];
  const price = item ? taiwanCurrentPrice(item) : undefined;
  if (json.rtcode !== "0000" || !item || typeof price !== "number") return null;
  return {
    symbol: `${company.code}.${company.market}`,
    name: item.n || company.abbreviation || item.nf || company.name,
    price,
    quoteTime: parseTaiwanQuoteTime(item),
    currency: "TWD" as const,
    marketState: taiwanMarketState(),
    exchange: company.market === "TWO" ? "TPEx" : "TWSE",
    source: company.market === "TWO" ? "TWSE MIS OTC" : "TWSE MIS",
  };
}

function marketState(meta: ChartMeta) {
  const regular = meta.currentTradingPeriod?.regular;
  if (!regular?.start || !regular?.end) return "unknown";
  const now = Math.floor(Date.now() / 1000);
  return now >= regular.start && now <= regular.end ? "open" : "closed";
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
    const isTaiwanResult = result.symbol.endsWith(".TW") || result.symbol.endsWith(".TWO");
    const fetchedAt = new Date().toISOString();
    if (isTaiwanResult) {
      const code = result.symbol.replace(/\.(TW|TWO)$/i, "");
      const company = localCompany ?? taiwanCompanies.find((item) => item.code === code);
      if (!company) return NextResponse.json({ error: "找不到台股上市櫃對應資料" }, { status: 404 });
      const taiwanQuote = await getTaiwanQuote(company);
      if (!taiwanQuote) return NextResponse.json({ error: "找到股票，但目前沒有可用的台股即時報價" }, { status: 404 });
      return NextResponse.json({ ...taiwanQuote, fetchedAt });
    }

    const quote = await getYahooQuote(result.symbol);
    if (typeof quote?.regularMarketPrice !== "number") return NextResponse.json({ error: "找到股票，但目前沒有可用報價" }, { status: 404 });

    const symbol = quote.symbol || result.symbol;
    const isTaiwan = symbol.endsWith(".TW") || symbol.endsWith(".TWO");
    const exchangeQuote = !isTaiwan && quote.currency === "USD" ? await getYahooQuote("TWD=X") : null;
    return NextResponse.json({
      symbol,
      name: isTaiwan ? (result.shortname || result.longname || quote.shortName || symbol) : (result.longname || result.shortname || quote.longName || quote.shortName || symbol),
      price: quote.regularMarketPrice,
      quoteTime: quote.regularMarketTime ? new Date(quote.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
      fetchedAt,
      marketState: marketState(quote),
      currency: quote.currency === "USD" ? "USD" : isTaiwan ? "TWD" : quote.currency,
      exchangeRate: exchangeQuote?.regularMarketPrice,
      exchange: quote.exchangeName || result.exchange,
      source: "Yahoo Finance",
    });
  } catch {
    return NextResponse.json({ error: "股票搜尋或即時報價服務暫時無法使用" }, { status: 502 });
  }
}
