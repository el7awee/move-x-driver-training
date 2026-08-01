import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MOVE X | بوابة التشغيل",
  description: "بوابة MOVE X لإدارة المستخدمين والسائقين والسيارات والتشغيل.",
  applicationName: "MOVE X Operational Core",
  other: {"codex-preview": "development"},
  icons: {icon: "/favicon.svg", shortcut: "/favicon.svg"},
};

export const viewport: Viewport = {width: "device-width", initialScale: 1, themeColor: "#07111f"};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="ar" dir="rtl" suppressHydrationWarning><body><noscript><div className="op-noscript">يحتاج نظام Move X إلى تشغيل JavaScript لفتح صفحة تسجيل الدخول واستخدام أدوات الإدارة.</div></noscript>{children}</body></html>;
}
