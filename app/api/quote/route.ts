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

async function getTaiwanQuote(symbol: string) {
  const market = symbol.endsWith(".TWO") ? "TWO" : "TW";
  const exchange = market === "TWO" ? "otc" : "tse";
  const code = symbol.replace(/\.(TW|TWO)$/i, "");
  const endpoint = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${exchange}_${code}.tw&json=1&delay=0`;
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
  const item = json.msgArray?.find((quote) => quote.c === code) ?? json.msgArray?.[0];
  const price = item ? taiwanCurrentPrice(item) : undefined;
  if (json.rtcode !== "0000" || !item || typeof price !== "number") return null;
  return {
    symbol: `${code}.${market}`,
    price,
    name: item.n || item.nf || symbol,
    currency: "TWD",
    quoteTime: parseTaiwanQuoteTime(item),
    fetchedAt: new Date().toISOString(),
    marketState: taiwanMarketState(),
    source: market === "TWO" ? "TWSE MIS OTC" : "TWSE MIS",
  };
}

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
    if (symbol.endsWith(".TW") || symbol.endsWith(".TWO")) {
      const taiwanQuote = await getTaiwanQuote(symbol);
      if (!taiwanQuote) return NextResponse.json({ error: "找不到此台股的即時報價" }, { status: 404 });
      return NextResponse.json(taiwanQuote);
    }

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
