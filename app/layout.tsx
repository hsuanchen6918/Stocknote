import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "Stocknote｜台美股庫存與加碼試算",
    description: "追蹤台股與美股庫存，計算即時報酬、平均成本、加碼後成本與目標價預期損益。",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title: "Stocknote｜看清成本，掌握下一步。", description: "台美股庫存、加碼與目標價試算工具", images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: "Stocknote｜看清成本，掌握下一步。", description: "台美股庫存、加碼與目標價試算工具", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
