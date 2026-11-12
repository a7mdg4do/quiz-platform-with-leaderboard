import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Sans_Arabic, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "مِقياس | منصة الاختبارات القصيرة ولوحة الصدارة",
  description:
    "منصة اختبارات تنافسية بترتيب عشوائي للأسئلة والخيارات لكل طالب، مؤقت 10 دقائق، ولوحة صدارة يتحكم المعلم في توقيت إعلانها.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${ibmPlexArabic.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-teal-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
