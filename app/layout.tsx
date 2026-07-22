import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MOVE X | تدريب وتقييم السائقين",
  description: "منصة MOVE X لتدريب السائقين ومتابعة الدورات والاختبارات والرحلات.",
  applicationName: "MOVE X Training",
  other: {"codex-preview": "development"},
  icons: {icon: "/favicon.svg", shortcut: "/favicon.svg"},
};

export const viewport: Viewport = {width: "device-width", initialScale: 1, themeColor: "#07111f"};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="ar" dir="rtl" suppressHydrationWarning><body>{children}</body></html>;
}
