import type { NextConfig } from "next";

// Tell the sign-in UI which social providers have credentials, without exposing them.
const authProviders = [
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && "google",
  process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET && "github",
].filter(Boolean);

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_AUTH_PROVIDERS: authProviders.join(",") },
  async headers() {
    return [
      {
        // A stale worker would keep running old code; the browser must always re-check this file.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  images: {
    // Product images come from arbitrary retailer CDNs.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
