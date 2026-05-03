import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  outputFileTracingIncludes: {
    "/api/**": ["./lib/geo/**"],
  },
  serverExternalPackages: ["@react-pdf/renderer"],
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
        "localhost:3333",
        "localhost:3334",
        "localhost:3335",
        "*.app.github.dev",
        "rutgr.com",
        "*.rutgr.com",
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
      // Phase 3 PR-B analytics pixel runtime + loader. Hashed filenames
      // are content-addressable, so they get a year-long immutable
      // cache. Cross-Origin-Resource-Policy: same-origin prevents
      // third-party domains from loading our bundles via <script>
      // injection (defense-in-depth on top of the origin gate at the
      // dispatch endpoint).
      {
        source: "/analytics/runtime.:hash.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/analytics/runtime.:hash.js.map",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/analytics/loader.:hash.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/analytics/loader.:hash.js.map",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      // Manifest must be fresh for cache invalidation to work — when a
      // new build ships, the loader reads this to learn the new hashed
      // filename. 60s TTL + must-revalidate keeps it from going stale
      // on the CDN while still respecting client caches under load.
      {
        source: "/analytics/runtime-manifest.json",
        headers: [
          { key: "Cache-Control", value: "public, max-age=60, must-revalidate" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
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
