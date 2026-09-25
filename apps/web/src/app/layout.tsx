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
  title: { default: "Kage: the human shadow for AI agents", template: "%s" },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  description: "When AI needs a human, Kage finds one. Human judgment and consensus as an API, paid in USDC on Solana.",
};

export const viewport: Viewport = {
  themeColor: [
    { color: "#0c0e0d" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" style={{ colorScheme: "dark" }} className={`${pally.variable} ${switzer.variable}`}>
      <body>{children}</body>
    </html>
  );
}
