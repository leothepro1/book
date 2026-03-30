export const dynamic = "force-dynamic";

/**
 * Analytics Event Ingestion
 * ═════════════════════════
 *
 * POST /api/analytics/events
 *
 * Receives batches of up to 10 frontend events.
 * Fast — runs on every page view.
 * Never crashes — all errors caught and logged silently.
 *
 * Commerce events (ORDER_*) are rejected at the API boundary.
 * tenantId is resolved from the Host header — never trusted from client.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { resolveGeo } from "@/app/_lib/analytics/geo";
import { parseDeviceType } from "@/app/_lib/analytics/device";
import { checkRateLimit } from "@/app/_lib/rate-limit/checkout";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { log } from "@/app/_lib/logger";

// Only frontend event types — commerce events are server-side only
const ALLOWED_EVENT_TYPES = [
  "SESSION_STARTED", "PAGE_VIEWED", "SESSION_ENDED",
  "SEARCH_PERFORMED", "ACCOMMODATION_VIEWED", "RATE_PLAN_SELECTED",
  "PRODUCT_VIEWED", "ADDON_VIEWED", "ADDON_ADDED", "ADDON_REMOVED",
  "CHECKOUT_STARTED", "CHECKOUT_COMPLETED", "CHECKOUT_ABANDONED",
] as const;

const EventSchema = z.object({
  sessionId: z.string().min(1),
  visitorId: z.string().min(1),
  eventType: z.enum(ALLOWED_EVENT_TYPES),
  occurredAt: z.string(),
  page: z.string().max(500).nullable().optional(),
  referrer: z.string().max(500).nullable().optional(),
  utmSource: z.string().max(200).nullable().optional(),
  utmMedium: z.string().max(200).nullable().optional(),
  utmCampaign: z.string().max(200).nullable().optional(),
  utmContent: z.string().max(200).nullable().optional(),
  utmTerm: z.string().max(200).nullable().optional(),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
});

const BatchSchema = z.object({
  events: z.array(EventSchema).min(1).max(10),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    // 1. Rate limit — 100 requests/min per IP
    const allowed = await checkRateLimit("analytics-events", 100, 60_000);
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "Rate limited" }, { status: 429 });
    }

    // 2. Resolve tenant from Host header — never trust client
    const tenant = await resolveTenantFromHost();
    if (!tenant) {
      return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 400 });
    }
    const tenantId = tenant.id;

    // 3. Parse body
    const body = await req.json();
    const parsed = BatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }

    // 4. Extract IP for geo (never stored)
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    // 5. Geo lookup (once per request)
    const geo = await resolveGeo(ip);

    // 6. Device type (once per request)
    const deviceType = parseDeviceType(req.headers.get("user-agent"));

    // 7. Insert events — tenantId from server, never from client
    await prisma.analyticsEvent.createMany({
      data: parsed.data.events.map((event) => ({
        tenantId,
        sessionId: event.sessionId,
        visitorId: event.visitorId,
        eventType: event.eventType,
        occurredAt: new Date(event.occurredAt),
        page: event.page ?? null,
        referrer: event.referrer ?? null,
        utmSource: event.utmSource ?? null,
        utmMedium: event.utmMedium ?? null,
        utmCampaign: event.utmCampaign ?? null,
        utmContent: event.utmContent ?? null,
        utmTerm: event.utmTerm ?? null,
        deviceType,
        locationId: geo?.locationId ?? null,
        payload: event.payload ? (event.payload as Prisma.InputJsonValue) : undefined,
      })),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Never crash — frontend uses sendBeacon which ignores response
    log("error", "analytics.ingestion_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
