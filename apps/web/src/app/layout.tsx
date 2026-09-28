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

const switzer = localFont({
  src: [
    { path: "../fonts/switzer-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/switzer-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/switzer-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-switzer",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TIDEPOOL",
  manifest: "/manifest.webmanifest",
  description:
    "Crypto is hard, so we made it a game. TIDEPOOL is a pocket arcade game where every move is a real Solana action.",
};

export const viewport: Viewport = {
  themeColor: [
    { color: "#f5f5f7" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${pally.variable} ${switzer.variable}`}>
      <body>{children}</body>
    </html>
  );
}
