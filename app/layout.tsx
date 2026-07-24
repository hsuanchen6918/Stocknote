import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d6b5e",
};

export async function generateMetadata(): Promise<Metadata> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    applicationName: "Stocknote",
    title: "Stocknote｜搶救錢包",
    description: "台股與美股庫存管理，即時報價、加碼試算與目標價損益估算。",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "Stocknote", statusBarStyle: "black-translucent" },
    formatDetection: { telephone: false },
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/apple-touch-icon.png" },
    openGraph: { title: "Stocknote｜搶救錢包", description: "台美股庫存、即時報價、加碼與目標價試算工具", images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: "Stocknote｜搶救錢包", description: "台美股庫存、即時報價、加碼與目標價試算工具", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
