/**
 * Database readiness checks.
 *
 * Two separate checks so triage is unambiguous:
 *   - db_pooled — the pooled endpoint the app hot-path uses (via Prisma singleton)
 *   - db_direct — the direct endpoint used for migrations and long-running ops
 *
 * db_pooled failing but db_direct OK ⇒ pgbouncer/pooler issue, not DB itself.
 * Both failing ⇒ Neon region outage or credentials issue.
 */

import { Client } from "pg";
import { prisma } from "@/app/_lib/db/prisma";
import type { Check, CheckResult } from "./_types";

// Latency thresholds (ms). Beyond 2000ms is considered down even if the query
// eventually returned — a read this slow means user-facing SLOs are blown.
const THRESHOLD_OK_MS = 100;
const THRESHOLD_DEGRADED_MS = 2000;

function classify(latency_ms: number): "ok" | "degraded" | "down" {
  if (latency_ms < THRESHOLD_OK_MS) return "ok";
  if (latency_ms < THRESHOLD_DEGRADED_MS) return "degraded";
  return "down";
}

// ── db_pooled — runs against the Prisma singleton (pooled URL) ───────────

export const dbPooledCheck: Check = {
  name: "db_pooled",
  timeout_ms: 5000,
  async run(): Promise<CheckResult> {
    const started = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      const latency_ms = Date.now() - started;
      return {
        name: "db_pooled",
        status: classify(latency_ms),
        latency_ms,
      };
    } catch {
      // Never propagate error details to the public response. Internal
      // observability (Sentry, logs) is handled by the readiness route.
      return {
        name: "db_pooled",
        status: "down",
        latency_ms: Date.now() - started,
        message: "pooled connection query failed",
      };
    }
  },
};

// ── db_direct — runs a short-lived pg.Client against DIRECT_URL ──────────

export const dbDirectCheck: Check = {
  name: "db_direct",
  timeout_ms: 5000,
  async run(): Promise<CheckResult> {
    const started = Date.now();
    const url = process.env.DIRECT_URL;

    if (!url) {
      return {
        name: "db_direct",
        status: "down",
        latency_ms: 0,
        message: "DIRECT_URL not configured",
      };
    }

    // pg.Client, not Prisma — avoids instantiating a second PrismaClient
    // just for this check. The client is single-use: connect, query, end.
    const client = new Client({
      connectionString: url,
      ssl: { rejectUnauthorized: true },
      // Keep per-statement and connection timeouts tight so a hung probe
      // doesn't linger past the readiness route's Promise.race timeout.
      connectionTimeoutMillis: 4000,
      statement_timeout: 4000,
      query_timeout: 4000,
    });

    try {
      await client.connect();
      await client.query("SELECT 1");
      const latency_ms = Date.now() - started;
      return {
        name: "db_direct",
        status: classify(latency_ms),
        latency_ms,
      };
    } catch {
      return {
        name: "db_direct",
        status: "down",
        latency_ms: Date.now() - started,
        message: "direct connection query failed",
      };
    } finally {
      // end() may reject if connect() never succeeded; swallow silently
      // so the finally doesn't mask the original failure mode.
      try {
        await client.end();
      } catch {
        /* noop */
      }
    }
  },
};
