/**
 * Readiness endpoint — `/api/health/ready`.
 *
 * Runs every registered dependency check in parallel, aggregates results,
 * returns 200/503 per Kubernetes readiness semantics:
 *
 *   all 'ok'                    → HTTP 200
 *   any 'degraded' (no 'down')  → HTTP 200 (warning)
 *   any 'down'                  → HTTP 503
 *
 * Query params:
 *   ?check=<name>   → run only the named check (400 if unknown)
 *   ?check=list     → return registered check names (200)
 *
 * Security: response body exposes status, latency, and the public message
 * on each check — never internal error details, stack traces, connection
 * strings, or secrets. Failures are logged internally (log() + Sentry).
 */

import { NextResponse } from "next/server";
import { checks, getCheck, listCheckNames, type Check, type CheckResult } from "../checks";
import { log } from "@/app/_lib/logger";

export const runtime = "nodejs"; // Prisma requires Node runtime
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Race a check against its configured timeout. If the check doesn't
 * resolve in time, produce a synthetic 'down' result. Also defends
 * against a misbehaving check that throws (contract says it shouldn't,
 * but we don't want the whole endpoint to 500 because one probe broke).
 */
function withTimeout(check: Check): Promise<CheckResult> {
  const timeout = new Promise<CheckResult>((resolve) => {
    setTimeout(() => {
      resolve({
        name: check.name,
        status: "down",
        latency_ms: check.timeout_ms,
        message: `timed out after ${check.timeout_ms}ms`,
      });
    }, check.timeout_ms);
  });

  const probe = check.run().catch(
    (): CheckResult => ({
      name: check.name,
      status: "down",
      latency_ms: 0,
      message: "check threw — this is a bug in the check itself",
    }),
  );

  return Promise.race([probe, timeout]);
}

/**
 * Fire Sentry + structured log for any 'down' check. Wrapped so Sentry
 * itself failing can never turn a successful readiness probe into a 500.
 */
function reportDown(result: CheckResult): void {
  try {
    log("error", "health.check_down", {
      check: result.name,
      latency_ms: result.latency_ms,
      message: result.message ?? null,
    });
  } catch {
    // log() writes to console.error synchronously — if even that fails,
    // we're in a runtime so broken that nothing we do matters.
  }

  try {
    const Sentry = require("@sentry/nextjs") as typeof import("@sentry/nextjs");
    Sentry.captureMessage(`health.check_down: ${result.name}`, "error");
  } catch {
    // Sentry not installed, bundle-time issue, or captureMessage threw —
    // fall back to console.error so we at least leave a trace.
    try {
      console.error(
        `[health] Sentry capture failed for ${result.name}; check is still down`,
      );
    } catch {
      /* noop */
    }
  }
}

function aggregate(results: readonly CheckResult[]): "ok" | "degraded" | "down" {
  if (results.some((r) => r.status === "down")) return "down";
  if (results.some((r) => r.status === "degraded")) return "degraded";
  return "ok";
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const checkParam = url.searchParams.get("check");

  // ?check=list — debug endpoint, always 200
  if (checkParam === "list") {
    return NextResponse.json(
      { checks: listCheckNames() },
      {
        status: 200,
        headers: { "cache-control": "no-store, no-cache, must-revalidate" },
      },
    );
  }

  // ?check=<name> — filter to a single check
  let toRun: readonly Check[] = checks;
  if (checkParam) {
    const found = getCheck(checkParam);
    if (!found) {
      return NextResponse.json(
        {
          error: "unknown check",
          available: listCheckNames(),
        },
        {
          status: 400,
          headers: { "cache-control": "no-store, no-cache, must-revalidate" },
        },
      );
    }
    toRun = [found];
  }

  // Run all selected checks in parallel with per-check timeout.
  const results = await Promise.all(toRun.map(withTimeout));

  // Report 'down' results to observability without blocking the response.
  for (const r of results) {
    if (r.status === "down") reportDown(r);
  }

  const overall = aggregate(results);
  const httpStatus = overall === "down" ? 503 : 200;

  return NextResponse.json(
    {
      status: overall,
      timestamp: new Date().toISOString(),
      checks: results,
    },
    {
      status: httpStatus,
      headers: { "cache-control": "no-store, no-cache, must-revalidate" },
    },
  );
}
