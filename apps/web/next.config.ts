import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/tidepool", destination: "/scrappyboy", permanent: false },
      // Screens from an earlier product on this codebase. They are not SCRAPPY BOY, so a
      // visitor who lands on one is sent to the console instead of a dead dashboard.
      { source: "/live", destination: "/scrappyboy?net=devnet", permanent: false },
      { source: "/app", destination: "/scrappyboy?net=devnet", permanent: false },
      { source: "/app/:path*", destination: "/scrappyboy?net=devnet", permanent: false },
    ];
  },
};

export default nextConfig;
