import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  experimental: {
    ...(isDev && { staleTimes: { dynamic: 0, static: 30 } }),
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "localhost:3001",
        "localhost:3002",
        "localhost:3003",
        "localhost:3005",
        "localhost:3007",
        "localhost:3009",
        "*.app.github.dev",
        "bedfront.com",
        "*.bedfront.com",
        "admin-plum-sigma.vercel.app",
      ],
    },
  },
  headers: async () => {
    // Dev: prevent Codespaces proxy from caching CSS/JS bundles
    if (isDev) {
      return [
        {
          source: "/_next/static/:path*",
          headers: [
            { key: "Cache-Control", value: "no-store" },
          ],
        },
      ];
    }

    return [
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/media/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

const sentryOptions = {
  silent: true,
  disableLogger: true,
  sourcemaps: {
    filesToDeleteAfterUpload: [".next/static/**/*.map"],
  },
};

export default isDev ? nextConfig : withSentryConfig(nextConfig, sentryOptions);
