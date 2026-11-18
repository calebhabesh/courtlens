import type { NextConfig } from "next";
import { COMPATIBILITY_REDIRECTS, CONSOLIDATED_REDIRECTS, HIDDEN_REDIRECTS, HOME_REDIRECT, HOSTED_DEMO_REDIRECTS } from "./lib/route-consolidation";

const hostedDemo = process.env.NEXT_PUBLIC_COURTLENS_HOSTED_DEMO === "1";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd()
  },
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
      },
      // Speed plan SP06. Team logos are named `<slug>-<first 16 hex of their SHA-256>.<ext>`
      // (scripts/team_branding_assets.py), so a changed file gets a new name: cache it for good.
      // Only names of that shape match; any other file there keeps the default.
      {
        source: "/team-logos/:file([a-z0-9-]+-[0-9a-f]{16}\\.(?:svg|png))",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      },
      // Flags keep their names when redrawn, so 30 days rather than immutable.
      {
        source: "/flags/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000" }]
      }
    ];
  },
  async redirects() {
    return [HOME_REDIRECT, ...COMPATIBILITY_REDIRECTS, ...CONSOLIDATED_REDIRECTS, ...HIDDEN_REDIRECTS, ...(hostedDemo ? HOSTED_DEMO_REDIRECTS : [])].map(redirect => ({ ...redirect, permanent: false }));
  }
};

export default nextConfig;
