import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ["", "/docs", "/live", "/app"].map((p) => ({ url: `https://scrappypet.vercel.app${p}`, lastModified: now }));
}
