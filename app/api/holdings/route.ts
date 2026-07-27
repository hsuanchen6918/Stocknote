import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Currency = "TWD" | "USD";
type MarketState = "open" | "closed" | "unknown";

type CloudHolding = {
  id: string;
  symbol: string;
  name: string;
  shares: number;
  cost: number;
  price: number;
  currency: Currency;
  updatedAt?: string;
  quoteTime?: string;
  fetchedAt?: string;
  marketState?: MarketState;
  inputCost?: number;
  inputCostCurrency?: Currency;
  exchangeRate?: number;
  inputFee?: number;
  inputOtherFee?: number;
};

type CloudPayload = {
  holdings: CloudHolding[];
  updatedAt: string;
};

const STORE_NAME = "stocknote-holdings";
const MAX_HOLDINGS = 300;

function userKey(userId: string) {
  return `${userId.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function asOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function asCurrency(value: unknown): Currency | undefined {
  return value === "USD" || value === "TWD" ? value : undefined;
}

function asMarketState(value: unknown): MarketState | undefined {
  return value === "open" || value === "closed" || value === "unknown" ? value : undefined;
}

function addOptionalText(target: CloudHolding, key: "updatedAt" | "quoteTime" | "fetchedAt", value: unknown) {
  const text = asText(value);
  if (text) target[key] = text;
}

function addOptionalNumber(target: CloudHolding, key: "inputCost" | "exchangeRate" | "inputFee" | "inputOtherFee", value: unknown) {
  const numberValue = asOptionalNumber(value);
  if (numberValue !== undefined) target[key] = numberValue;
}

function sanitizeHoldings(value: unknown) {
  if (!Array.isArray(value)) return [];

  const holdings: CloudHolding[] = [];
  for (const rawItem of value) {
    const item = asRecord(rawItem);
    if (!item) continue;

    const symbol = asText(item.symbol).toUpperCase();
    const name = asText(item.name, symbol);
    const currency = asCurrency(item.currency) ?? "TWD";
    const shares = asNumber(item.shares);
    const cost = asNumber(item.cost);
    const price = asNumber(item.price);

    if (!symbol || shares <= 0 || cost < 0 || price < 0) continue;

    const holding: CloudHolding = {
      id: asText(item.id) || crypto.randomUUID(),
      symbol,
      name,
      shares,
      cost,
      price,
      currency,
    };

    addOptionalText(holding, "updatedAt", item.updatedAt);
    addOptionalText(holding, "quoteTime", item.quoteTime);
    addOptionalText(holding, "fetchedAt", item.fetchedAt);
    addOptionalNumber(holding, "inputCost", item.inputCost);
    addOptionalNumber(holding, "exchangeRate", item.exchangeRate);
    addOptionalNumber(holding, "inputFee", item.inputFee);
    addOptionalNumber(holding, "inputOtherFee", item.inputOtherFee);

    const inputCostCurrency = asCurrency(item.inputCostCurrency);
    if (inputCostCurrency) holding.inputCostCurrency = inputCostCurrency;

    const marketState = asMarketState(item.marketState);
    if (marketState) holding.marketState = marketState;

    holdings.push(holding);
    if (holdings.length >= MAX_HOLDINGS) break;
  }

  return holdings;
}

function authError() {
  return NextResponse.json({ error: "請先登入 Google，才能同步庫存。" }, { status: 401 });
}

function serverError(error: unknown) {
  console.error("Stocknote holdings sync failed", error);
  return NextResponse.json({ error: "雲端同步失敗，請確認 Netlify 已啟用 Identity 與 Blobs。" }, { status: 500 });
}

export async function GET() {
  try {
    const user = await getUser();
    if (!user?.id) return authError();

    const store = getStore({ name: STORE_NAME, consistency: "strong" });
    const payload = await store.get(userKey(user.id), { type: "json", consistency: "strong" }) as CloudPayload | null;

    if (!payload) {
      return NextResponse.json({ exists: false, holdings: [], updatedAt: null });
    }

    return NextResponse.json({
      exists: true,
      holdings: sanitizeHoldings(payload.holdings),
      updatedAt: payload.updatedAt,
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getUser();
    if (!user?.id) return authError();

    const body = asRecord(await request.json().catch(() => null));
    if (!body || !Array.isArray(body.holdings)) {
      return NextResponse.json({ error: "庫存資料格式不正確。" }, { status: 400 });
    }

    const holdings = sanitizeHoldings(body.holdings);
    const updatedAt = new Date().toISOString();
    const payload: CloudPayload = { holdings, updatedAt };

    const store = getStore({ name: STORE_NAME, consistency: "strong" });
    await store.setJSON(userKey(user.id), payload, {
      metadata: {
        userId: user.id,
        email: user.email ?? "",
      },
    });

    return NextResponse.json({ exists: true, holdings, updatedAt });
  } catch (error) {
    return serverError(error);
  }
}
