import type { NextConfig } from "next";
import { COMPATIBILITY_REDIRECTS, CONSOLIDATED_REDIRECTS, HIDDEN_REDIRECTS, HOSTED_DEMO_REDIRECTS } from "./lib/route-consolidation";

const hostedDemo = process.env.NEXT_PUBLIC_COURTLENS_HOSTED_DEMO === "1";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd()
  },
  outputFileTracingIncludes: { "/whats-new": ["./content/*.md"], "/whats-new/blog": ["./content/*.md"] },
  poweredByHeader: false,
  reactStrictMode: true,
  devIndicators: false,
  experimental: {
    typedEnv: true,
    // Upgraded by `next upgrade --agent=security` (16.4.0 to 16.4.2).
    agentUpgrade: "security"
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
        ]
      }
    ];
  },
  async redirects() {
    return [...COMPATIBILITY_REDIRECTS, ...CONSOLIDATED_REDIRECTS, ...HIDDEN_REDIRECTS, ...(hostedDemo ? HOSTED_DEMO_REDIRECTS : [])].map(redirect => ({ ...redirect, permanent: false }));
  }
};

export default nextConfig;
