import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { themeInitScript } from "@/components/ThemeToggle";
import { Toaster } from "@/components/Toaster";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Regressa", template: "%s · Regressa" },
  description: "Catch AI regressions before your users do.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head>
      <body>{children}<Toaster /></body>
    </html>
  );
}
