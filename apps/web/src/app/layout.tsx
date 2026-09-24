import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sentient = localFont({
  src: [
    { path: "../fonts/Sentient-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/Sentient-400i.woff2", weight: "400", style: "italic" },
    { path: "../fonts/Sentient-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/Sentient-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-sentient",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Scrappy",
  description:
    "A pocket pet that earns real money doing tiny jobs for AI agents, with a little help from you.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ddeeff" },
    { media: "(prefers-color-scheme: dark)", color: "#111a2e" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={sentient.variable}>
      <body>{children}</body>
    </html>
  );
}
