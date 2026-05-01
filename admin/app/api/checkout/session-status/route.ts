/**
 * Phase G — Polling endpoint for buyer-side unlink notification.
 *
 * Implements v1.3 §6.3 + §11.4. Buyer's checkout page polls this
 * endpoint at 15s cadence; the success page polls at 3s cadence
 * during webhook-race resolution. Returns the minimal payload
 * needed by both consumers.
 *
 *   GET /api/checkout/session-status?id={sessionId}
 *   200 → { status, lastBuyerActivityAt, completedOrderId, shareLinkToken }
 *   400 → invalid id format (cuid expected)
 *   404 → no row matches
 *   429 → IP rate limit exceeded (Retry-After header)
 *
 * Cache: Upstash Redis, 5s TTL keyed on sessionId. Status transitions
 * (ACTIVE → UNLINKED/PAID/etc.) are NOT explicitly invalidated — the
 * 5s TTL is the freshness contract. Worst-case buyer latency is
 * 5s + the polling interval (15s for checkout, 3s for success).
 *
 * Tenant scoping is intentionally NOT enforced. Session IDs are cuids
 * (~128 bits of entropy); cross-tenant guessing is computationally
 * infeasible. If a future security review wants belt-and-braces, the
 * integration point is the `findUnique` select — add tenantId, then
 * compare against `resolveTenantFromHost`.
 */

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { prisma } from "@/app/_lib/db/prisma";
import { redis } from "@/app/_lib/redis/client";
import { checkRateLimit, getClientIp } from "@/app/_lib/rate-limit/checkout";
import { log } from "@/app/_lib/logger";

const CACHE_TTL_SECONDS = 5;
const ACTIVITY_DEBOUNCE_MS = 30_000;
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

/** cuid v1: 25-char string starting with `c`. Tight enough to reject
 * obvious garbage without being so strict that platform churn breaks
 * us — validated against the same generator Prisma uses. */
const CUID_RE = /^c[a-z0-9]{24}$/;

interface SessionStatusPayload {
  status:
    | "ACTIVE"
    | "UNLINKED"
    | "EXPIRED"
    | "PAID"
    | "CANCELLED";
  lastBuyerActivityAt: string | null;
  completedOrderId: string | null;
  shareLinkToken: string;
}

function cacheKey(id: string): string {
  return `bedfront:dcs:status:${id}`;
}

export async function GET(req: Request): Promise<NextResponse> {
  // ── Rate limit (per-IP, distributed) ────────────────────────
  const allowed = await checkRateLimit(
    "dcs-status",
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!allowed) {
    const ip = await getClientIp();
    log("warn", "draft_invoice.session_status_rate_limited", { ip });
    return NextResponse.json(
      { error: "RATE_LIMITED" },
      {
        status: 429,
        headers: { "Retry-After": "60" },
      },
    );
  }

  // ── Validate id ─────────────────────────────────────────────
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id || !CUID_RE.test(id)) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  // ── Cache read ──────────────────────────────────────────────
  const key = cacheKey(id);
  const cached = await redis.get<SessionStatusPayload>(key);
  if (cached) {
    return NextResponse.json(cached);
  }

  // ── DB read ─────────────────────────────────────────────────
  const row = await prisma.draftCheckoutSession.findUnique({
    where: { id },
    select: {
      status: true,
      lastBuyerActivityAt: true,
      draftOrder: {
        select: {
          completedOrderId: true,
          shareLinkToken: true,
        },
      },
    },
  });

  if (!row) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // shareLinkToken is set at sendInvoice; a row with no token is an
  // upstream invariant violation. 404 keeps the contract clean for
  // callers (ProcessingState would otherwise build /invoice/null).
  if (!row.draftOrder.shareLinkToken) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const payload: SessionStatusPayload = {
    status: row.status,
    lastBuyerActivityAt: row.lastBuyerActivityAt
      ? row.lastBuyerActivityAt.toISOString()
      : null,
    completedOrderId: row.draftOrder.completedOrderId,
    shareLinkToken: row.draftOrder.shareLinkToken,
  };

  // ── Cache write (5s TTL) ────────────────────────────────────
  await redis.set(key, payload, { ex: CACHE_TTL_SECONDS });

  // ── Debounced lastBuyerActivityAt update ────────────────────
  // Fire-and-forget. Cache reflects DB state on the next read after
  // TTL expires; lastBuyerActivityAt drift is non-load-bearing for
  // the polling contract (the inactivity-sweep cron is the consumer
  // of this column, not the buyer).
  const now = Date.now();
  const last = row.lastBuyerActivityAt?.getTime() ?? 0;
  if (now - last > ACTIVITY_DEBOUNCE_MS) {
    void prisma.draftCheckoutSession
      .update({
        where: { id },
        data: { lastBuyerActivityAt: new Date(now) },
      })
      .catch((err) => {
        log("warn", "draft_invoice.session_status_activity_update_failed", {
          sessionId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }

  log("info", "draft_invoice.session_status_polled", {
    sessionId: id,
    status: row.status,
    cacheHit: false,
  });

  return NextResponse.json(payload);
}
