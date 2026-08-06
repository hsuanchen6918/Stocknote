import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type MarketState = "open" | "closed" | "unknown";

type CloudWatchItem = {
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

type CloudPayload = { watchlist: CloudWatchItem[]; updatedAt: string };

const STORE_NAME = "stocknote-watchlist";
const MAX_ITEMS = 300;

function userKey(userId: string) {
  return `${userId.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sanitizeWatchlist(value: unknown) {
  if (!Array.isArray(value)) return [];
  const rows: CloudWatchItem[] = [];
  for (const raw of value) {
    const item = asRecord(raw);
    if (!item) continue;
    const symbol = text(item.symbol).toUpperCase();
    const price = number(item.price);
    if (!symbol || price === undefined || price < 0) continue;
    const row: CloudWatchItem = {
      id: text(item.id) || crypto.randomUUID(),
      symbol,
      name: text(item.name, symbol),
      price,
      currency: text(item.currency, "TWD"),
    };
    const previousClose = number(item.previousClose);
    if (previousClose !== undefined) row.previousClose = previousClose;
    for (const key of ["exchange", "quoteTime", "fetchedAt"] as const) {
      const value = text(item[key]);
      if (value) row[key] = value;
    }
    if (item.marketState === "open" || item.marketState === "closed" || item.marketState === "unknown") row.marketState = item.marketState;
    rows.push(row);
    if (rows.length >= MAX_ITEMS) break;
  }
  return rows;
}

function authError() {
  return NextResponse.json({ error: "請先登入 Google，才能同步自選清單。" }, { status: 401 });
}

function serverError(error: unknown) {
  console.error("Stocknote watchlist sync failed", error);
  return NextResponse.json({ error: "自選清單雲端同步失敗，請稍後再試。" }, { status: 500 });
}

export async function GET() {
  try {
    const user = await getUser();
    if (!user?.id) return authError();
    const store = getStore({ name: STORE_NAME, consistency: "strong" });
    const payload = await store.get(userKey(user.id), { type: "json", consistency: "strong" }) as CloudPayload | null;
    if (!payload) return NextResponse.json({ exists: false, watchlist: [], updatedAt: null });
    return NextResponse.json({ exists: true, watchlist: sanitizeWatchlist(payload.watchlist), updatedAt: payload.updatedAt });
  } catch (error) { return serverError(error); }
}

export async function PUT(request: Request) {
  try {
    const user = await getUser();
    if (!user?.id) return authError();
    const body = asRecord(await request.json().catch(() => null));
    if (!body || !Array.isArray(body.watchlist)) return NextResponse.json({ error: "自選清單格式不正確。" }, { status: 400 });
    const watchlist = sanitizeWatchlist(body.watchlist);
    const updatedAt = new Date().toISOString();
    const store = getStore({ name: STORE_NAME, consistency: "strong" });
    await store.setJSON(userKey(user.id), { watchlist, updatedAt }, { metadata: { userId: user.id, email: user.email ?? "" } });
    return NextResponse.json({ exists: true, watchlist, updatedAt });
  } catch (error) { return serverError(error); }
}
