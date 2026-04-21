/**
 * Liveness endpoint — `/api/health`.
 *
 * Kubernetes pattern: "is this instance alive?" — yes if it can serve a
 * request at all. No dependency checks. No DB. No Redis. No Prisma.
 *
 * Returns 200 unconditionally, as long as the route handler can run.
 * If this ever returns non-200, the Next.js runtime itself is broken.
 *
 * Use `/api/health/ready` for dependency-aware readiness.
 */

import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Module load time — proxy for instance boot time. On Edge runtime,
// instances are short-lived, so this is closer to "since last cold start".
const BOOT_TIME = Date.now();

export function GET(): NextResponse {
  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime_ms: Date.now() - BOOT_TIME,
    },
    {
      status: 200,
      headers: {
        // Defense in depth — even with force-dynamic, ensure no CDN caches this.
        "cache-control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
