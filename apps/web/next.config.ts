import type { NextConfig } from "next";

// STATIC_EXPORT=1 builds the plain-file site that Convex static hosting serves; there the
// redirects and the /api proxies live in convex/http.ts instead.
const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = staticExport
  ? { output: "export", trailingSlash: true, images: { unoptimized: true } }
  : {
      async redirects() {
        return [
          { source: "/tidepool", destination: "/scrappyboy", permanent: false },
          // Screens from an earlier product on this codebase. They are not SCRAPPY BOY, so a
          // visitor who lands on one is sent to the console instead of a dead dashboard.
          { source: "/live", destination: "/scrappyboy?net=devnet", permanent: false },
          { source: "/play", destination: "/scrappyboy?net=devnet", permanent: false },
          { source: "/app", destination: "/scrappyboy?net=devnet", permanent: false },
          { source: "/app/:path*", destination: "/scrappyboy?net=devnet", permanent: false },
        ];
      },
    };

export default nextConfig;
