import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Product images come from arbitrary retailer CDNs.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
