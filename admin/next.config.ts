import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "localhost:3001",
        "*.app.github.dev",
        "bedfront.com",
        "*.bedfront.com",
        "admin-plum-sigma.vercel.app",
      ],
    },
  },
  headers: async () => [
    {
      // Force revalidation of all pages — clears stale browser cache
      source: "/:path*",
      headers: [
        { key: "Cache-Control", value: "no-store, must-revalidate" },
      ],
    },
  ],
};

export default nextConfig;
