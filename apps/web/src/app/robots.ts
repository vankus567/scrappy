import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/app/", "/dev"] }, sitemap: "https://scrappypet.vercel.app/sitemap.xml" };
}
