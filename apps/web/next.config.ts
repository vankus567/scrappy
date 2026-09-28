import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/tidepool", destination: "/scrappyboy", permanent: false }];
  },
};

export default nextConfig;
