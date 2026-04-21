/**
 * Upstash Redis readiness check.
 *
 * Three states:
 *   - configured + healthy  → 'ok' (with latency)
 *   - configured but slow   → 'degraded' or 'down' by latency class
 *   - configured + errors   → 'down'
 *   - NOT configured (dev)  → 'ok' with explanatory message
 *
 * The last case is by design per B1 decision: dev environments run without
 * Upstash credentials and fall back to a no-op Redis proxy. Reporting
 * those as 'down' would produce false alarms; reporting them silently as
 * 'ok' hides the fact we're in a degraded-capability mode. Splitting the
 * difference: status='ok' + explicit message makes the dev-mode visible
 * without triggering alerts.
 */

import { redis } from "@/app/_lib/redis/client";
import type { Check, CheckResult } from "./_types";

const THRESHOLD_OK_MS = 50;
const THRESHOLD_DEGRADED_MS = 500;

function classify(latency_ms: number): "ok" | "degraded" | "down" {
  if (latency_ms < THRESHOLD_OK_MS) return "ok";
  if (latency_ms < THRESHOLD_DEGRADED_MS) return "degraded";
  return "down";
}

function isConfigured(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
  return url.startsWith("https://") && token.length > 0;
}

export const redisCheck: Check = {
  name: "redis",
  timeout_ms: 3000,
  async run(): Promise<CheckResult> {
    if (!isConfigured()) {
      return {
        name: "redis",
        status: "ok",
        latency_ms: 0,
        message: "Upstash not configured (dev mode)",
        details: { configured: false },
      };
    }

    const started = Date.now();
    try {
      // @upstash/redis PING returns the string "PONG" on success.
      // The dev-proxy returns null — but we already short-circuited above
      // via isConfigured(), so here we always talk to real Upstash.
      const result = await redis.ping();
      const latency_ms = Date.now() - started;

      if (result !== "PONG") {
        return {
          name: "redis",
          status: "down",
          latency_ms,
          message: "unexpected PING response",
        };
      }

      return {
        name: "redis",
        status: classify(latency_ms),
        latency_ms,
        details: { configured: true },
      };
    } catch {
      return {
        name: "redis",
        status: "down",
        latency_ms: Date.now() - started,
        message: "redis ping failed",
      };
    }
  },
};
