import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
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
  headers: async () => [
    {
      // Static assets — browser cache 1 year, immutable (Next.js content-hashes filenames)
      source: "/_next/static/:path*",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
    {
      // Uploaded media (Cloudinary proxied or local) — cache 1 hour, SWR 24h
      source: "/media/:path*",
      headers: [
        { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
      ],
    },
    {
      // API routes — never cache
      source: "/api/:path*",
      headers: [
        { key: "Cache-Control", value: "no-store" },
      ],
    },
    // No catch-all no-store — Next.js and Vercel handle page caching
    // via ISR and per-route dynamic/revalidate exports.
  ],
};

export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
  sourcemaps: {
    filesToDeleteAfterUpload: [".next/static/**/*.map"],
  },
});
