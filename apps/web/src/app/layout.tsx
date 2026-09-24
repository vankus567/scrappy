import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const pally = localFont({
  src: [
    { path: "../fonts/pally-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/pally-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/pally-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-pally",
  display: "swap",
});

const satoshi = localFont({
  src: [
    { path: "../fonts/satoshi-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/satoshi-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/satoshi-700.woff2", weight: "700", style: "normal" },
    { path: "../fonts/satoshi-900.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Scrappy",
  description:
    "A pocket pet that earns real money doing tiny jobs for AI agents, with a little help from you.",
};

export const viewport: Viewport = {
  themeColor: [
    { color: "#f5f5f7" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${pally.variable} ${satoshi.variable}`}>
      <body>{children}</body>
    </html>
  );
}
