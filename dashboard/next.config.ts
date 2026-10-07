import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd()
  },
  outputFileTracingIncludes: { "/blog": ["./content/*.md"], "/patch-notes": ["./content/*.md"] },
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    typedEnv: true
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
    return [
      {
        source: "/pvp",
        destination: "/compare",
        permanent: false
      },
      {
        source: "/StatLineShift",
        destination: "/stat-line-shift",
        permanent: false
      },
      {
        source: "/zts",
        destination: "/research/adjusted-shooting",
        permanent: false
      },
      {
        source: "/shotquality",
        destination: "/research/expected-shots",
        permanent: false
      },
      {
        source: "/d-shotquality",
        destination: "/research/defensive-matchups",
        permanent: false
      },
      {
        source: "/kawhifiles",
        destination: "/research/case-studies",
        permanent: false
      },
      {
        source: "/ask",
        destination: "/research/ask",
        permanent: false
      },
      {
        source: "/dashboard",
        destination: "/players",
        permanent: false
      }
    ];
  }
};

export default nextConfig;
