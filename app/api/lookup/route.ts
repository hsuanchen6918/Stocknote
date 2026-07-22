import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SearchQuote = {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchange?: string;
};

type TaiwanCompany = {
  SecuritiesCompanyCode?: string;
  CompanyName?: string;
  CompanyAbbreviation?: string;
  Market?: "TW" | "TWO";
};

let taiwanCompaniesPromise: Promise<TaiwanCompany[]> | undefined;

function getTaiwanCompanies() {
  if (!taiwanCompaniesPromise) {
    taiwanCompaniesPromise = Promise.allSettled([
      fetch("https://openapi.twse.com.tw/v1/opendata/t187ap03_L", { cache: "force-cache" }).then(async (response) => response.ok ? (await response.json() as TaiwanCompany[]).map((company) => ({ ...company, Market: "TW" as const })) : []),
      fetch("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O", { cache: "force-cache" }).then(async (response) => response.ok ? (await response.json() as TaiwanCompany[]).map((company) => ({ ...company, Market: "TWO" as const })) : []),
    ]).then((results) => results.flatMap((result) => result.status === "fulfilled" ? result.value : []));
  }
  return taiwanCompaniesPromise;
}

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
    chart?: { result?: Array<{ meta?: { symbol?: string; regularMarketPrice?: number; shortName?: string; longName?: string; currency?: string; exchangeName?: string } }> };
  };
  return json.chart?.result?.[0]?.meta ?? null;
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("q")?.trim();
  if (!raw) return NextResponse.json({ error: "請輸入股票名稱或代號" }, { status: 400 });

  try {
    const normalized = normalizeQuery(raw);
    let result: SearchQuote | undefined;

    const companies = await getTaiwanCompanies();
    const baseCode = normalized.replace(/\.(TW|TWO)$/i, "");
    const localCompany = companies.find((company) => company.SecuritiesCompanyCode === baseCode)
      ?? companies.find((company) => company.CompanyAbbreviation === raw || company.CompanyName === raw)
      ?? companies.find((company) => company.CompanyAbbreviation?.includes(raw) || company.CompanyName?.includes(raw));

    if (localCompany?.SecuritiesCompanyCode) {
      result = {
        symbol: `${localCompany.SecuritiesCompanyCode}.${localCompany.Market || (normalized.endsWith(".TWO") ? "TWO" : "TW")}`,
        shortname: localCompany.CompanyAbbreviation,
        longname: localCompany.CompanyName,
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
    return NextResponse.json({
      symbol,
      name: isTaiwan ? (result.shortname || result.longname || quote.shortName || symbol) : (result.longname || result.shortname || quote.longName || quote.shortName || symbol),
      price: quote.regularMarketPrice,
      currency: quote.currency === "USD" ? "USD" : isTaiwan ? "TWD" : quote.currency,
      exchange: quote.exchangeName || result.exchange,
      source: "Yahoo Finance",
    });
  } catch {
    return NextResponse.json({ error: "股票搜尋或即時報價服務暫時無法使用" }, { status: 502 });
  }
}
