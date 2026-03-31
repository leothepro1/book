export const dynamic = "force-dynamic";

/**
 * POST /api/portal/checkout/session
 * ═════════════════════════════════
 *
 * Creates a CheckoutSession when a guest clicks "Boka" on a rate plan.
 * Re-validates availability against PMS before creating the session.
 * Returns a token and redirect URL (addon page or checkout).
 *
 * The session is the single source of truth for the purchase flow.
 * URL params are NOT the source of truth — this session is.
 *
 * ── Complete purchase flow ──────────────────────────────────
 *
 * Step 1: RoomDetailClient "Boka"
 *   → POST /api/portal/checkout/session
 *   → Creates CheckoutSession with frozen PMS snapshot
 *   → Returns { token, redirect, hasAddons }
 *
 * Step 2a (addons exist):
 *   → /stays/[slug]/addons?session=[token]
 *   → Guest selects addons
 *   → PATCH /api/portal/checkout/session/[token]/addons
 *   → Freezes addon snapshots, transitions ADDON_SELECTION → CHECKOUT
 *   → Redirects to /checkout?session=[token]
 *
 * Step 2b (no addons):
 *   → /checkout?session=[token] directly
 *
 * Step 3: Checkout page
 *   → Loads session by token, gates by status
 *   → CheckoutClient calls POST /api/checkout/payment-intent { sessionToken }
 *   → Order + Booking created from session snapshot (no PMS re-fetch)
 *   → Session transitions to COMPLETED atomically with order creation
 *   → Returns { clientSecret, orderId }
 *
 * Step 4: Payment
 *   → Stripe confirms payment via webhook
 *   → Order status PENDING → PAID
 *
 * Invariants:
 *   - No price ever from URL params or client request body
 *   - All amounts frozen in session snapshot at creation time (öre)
 *   - Tenant isolation on every DB query
 *   - Session is the single source of truth from "Boka" to paid order
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { resolveAdapter } from "@/app/_lib/integrations/resolve";
import { validateStayDates } from "@/app/_lib/validation/dates";
import { checkRateLimit } from "@/app/_lib/rate-limit/checkout";
import { log } from "@/app/_lib/logger";
import type { CreateCheckoutSessionResponse } from "@/app/_lib/checkout/session-types";

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_NIGHTS = 90;

const inputSchema = z.object({
  accommodationId: z.string().min(1).max(100),
  ratePlanId: z.string().min(1).max(200),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(99),
});

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

function buildDedupKey(
  tenantId: string,
  accommodationId: string,
  ratePlanId: string,
  checkIn: string,
  checkOut: string,
  adults: number,
): string {
  const raw = `${tenantId}:${accommodationId}:${ratePlanId}:${checkIn}:${checkOut}:${adults}`;
  return crypto.createHash("sha256").update(raw).digest("base64url").slice(0, 32);
}

export async function POST(req: Request) {
  // ── Rate limit ──────────────────────────────────────────────
  if (!(await checkRateLimit("cs", 15, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  // ── Resolve tenant ──────────────────────────────────────────
  const tenant = await resolveTenantFromHost();
  if (!tenant) {
    return NextResponse.json({ error: "TENANT_NOT_FOUND" }, { status: 404 });
  }

  // ── Parse input ──────────────────────────────────────────────
  let body: z.infer<typeof inputSchema>;
  try {
    body = inputSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 });
  }

  // ── Validate dates ──────────────────────────────────────────
  const dateCheck = validateStayDates(body.checkIn, body.checkOut);
  if (!dateCheck.valid) {
    return NextResponse.json(
      { error: "INVALID_DATES", message: dateCheck.error },
      { status: 400 },
    );
  }

  if (dateCheck.nights > MAX_NIGHTS) {
    return NextResponse.json(
      { error: "INVALID_DATES", message: `Vistelse kan inte överstiga ${MAX_NIGHTS} nätter` },
      { status: 400 },
    );
  }

  // ── Load accommodation ─────────────────────────────────────
  const accommodation = await prisma.accommodation.findFirst({
    where: { id: body.accommodationId, tenantId: tenant.id, status: "ACTIVE", archivedAt: null },
    select: {
      id: true,
      slug: true,
      name: true,
      nameOverride: true,
      externalId: true,
      categoryItems: { select: { categoryId: true } },
    },
  });

  if (!accommodation) {
    log("warn", "checkout_session.accommodation_not_found", {
      tenantId: tenant.id,
      accommodationId: body.accommodationId,
    });
    return NextResponse.json(
      { error: "ACCOMMODATION_NOT_FOUND" },
      { status: 404 },
    );
  }

  // ── Re-validate availability via PMS ───────────────────────
  const adapter = await resolveAdapter(tenant.id);
  let availabilityResult;
  try {
    availabilityResult = await adapter.getAvailability(tenant.id, {
      checkIn: dateCheck.checkIn,
      checkOut: dateCheck.checkOut,
      guests: body.adults,
    });
  } catch (err) {
    log("error", "checkout_session.pms_unavailable", {
      tenantId: tenant.id,
      accommodationId: body.accommodationId,
      error: String(err),
    });
    return NextResponse.json(
      { error: "PMS_UNAVAILABLE", message: "Kunde inte verifiera tillgänglighet. Försök igen." },
      { status: 503 },
    );
  }

  // Find the matching category by externalId
  const matchingCategory = availabilityResult.categories.find(
    (c) => c.category.externalId === accommodation.externalId,
  );

  if (!matchingCategory || matchingCategory.availableUnits <= 0) {
    log("info", "checkout_session.accommodation_unavailable", {
      tenantId: tenant.id,
      accommodationId: body.accommodationId,
      checkIn: body.checkIn,
      checkOut: body.checkOut,
    });
    return NextResponse.json(
      { error: "ACCOMMODATION_UNAVAILABLE", message: "Boendet är inte längre tillgängligt för valda datum." },
      { status: 409 },
    );
  }

  // ── Find rate plan ──────────────────────────────────────────
  const ratePlan = matchingCategory.ratePlans.find(
    (rp) => rp.externalId === body.ratePlanId,
  );

  if (!ratePlan) {
    log("info", "checkout_session.rate_plan_unavailable", {
      tenantId: tenant.id,
      accommodationId: body.accommodationId,
      ratePlanId: body.ratePlanId,
    });
    return NextResponse.json(
      { error: "RATE_PLAN_UNAVAILABLE", message: "Prisalternativet är inte längre tillgängligt." },
      { status: 409 },
    );
  }

  // ── Check for addon products ────────────────────────────────
  const categoryIds = accommodation.categoryItems.map((ci) => ci.categoryId);

  let addonCount = 0;
  if (categoryIds.length > 0) {
    const addonLinks = await prisma.accommodationCategoryAddon.findMany({
      where: { categoryId: { in: categoryIds } },
      select: {
        collection: {
          select: {
            status: true,
            items: {
              where: {
                product: { status: "ACTIVE", archivedAt: null },
              },
              select: { id: true },
              take: 1, // We only need to know if ≥1 exists
            },
          },
        },
      },
    });

    addonCount = addonLinks.filter(
      (link) => link.collection.status === "ACTIVE" && link.collection.items.length > 0,
    ).length;
  }

  const hasAddons = addonCount > 0;
  const initialStatus = hasAddons ? "PENDING" : "CHECKOUT";

  // ── Dedup: handle existing sessions for same booking params ─
  const dedupKey = buildDedupKey(
    tenant.id,
    body.accommodationId,
    body.ratePlanId,
    body.checkIn,
    body.checkOut,
    body.adults,
  );

  const existingSession = await prisma.checkoutSession.findUnique({
    where: { dedupKey },
    select: { id: true, token: true, status: true, expiresAt: true, accommodationSlug: true },
  });

  if (existingSession) {
    const { status: existingStatus } = existingSession;
    const isExpiredOrAbandoned = existingStatus === "EXPIRED" || existingStatus === "ABANDONED";
    const isActive = existingSession.expiresAt > new Date() && !isExpiredOrAbandoned;

    // COMPLETED — booking went through, do not create another
    if (existingStatus === "COMPLETED") {
      return NextResponse.json(
        { error: "ALREADY_COMPLETED", message: "Denna bokning är redan genomförd." },
        { status: 409 },
      );
    }

    // CHECKOUT — guest is mid-payment, return existing session
    if (existingStatus === "CHECKOUT" && isActive) {
      return NextResponse.json({
        token: existingSession.token,
        redirect: "/checkout",
        hasAddons,
      } satisfies CreateCheckoutSessionResponse);
    }

    // PENDING / ADDON_SELECTION — guest is restarting, abandon old + create fresh
    // EXPIRED / ABANDONED — treat as non-existent, create fresh
    // All handled below: abandon if active, then delete to free dedupKey
  }

  // ── Create session atomically ──────────────────────────────
  // Transaction: abandon/delete old session + create new one in one shot.
  // Prevents race conditions between abandon and create.
  const displayName = accommodation.nameOverride ?? accommodation.name;
  const token = generateToken();

  const session = await prisma.$transaction(async (tx) => {
    if (existingSession) {
      // If still active (PENDING/ADDON_SELECTION), mark abandoned first
      if (existingSession.expiresAt > new Date() && existingSession.status !== "EXPIRED" && existingSession.status !== "ABANDONED") {
        await tx.checkoutSession.update({
          where: { id: existingSession.id },
          data: { status: "ABANDONED", dedupKey: null },
        });
      } else {
        // Expired/Abandoned — just clear dedupKey so we can reuse it
        await tx.checkoutSession.update({
          where: { id: existingSession.id },
          data: { dedupKey: null },
        });
      }
    }

    return tx.checkoutSession.create({
      data: {
        token,
        tenantId: tenant.id,
        status: initialStatus,
        accommodationId: accommodation.id,
        ratePlanId: body.ratePlanId,
        checkIn: dateCheck.checkIn,
        checkOut: dateCheck.checkOut,
        adults: body.adults,
        accommodationName: displayName,
        accommodationSlug: accommodation.slug,
        ratePlanName: ratePlan.name,
        ratePlanCancellationPolicy: ratePlan.cancellationPolicy,
        pricePerNight: ratePlan.pricePerNight,
        totalNights: dateCheck.nights,
        accommodationTotal: ratePlan.totalPrice,
        currency: ratePlan.currency,
        selectedAddons: [],
        dedupKey,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
  });

  log("info", "checkout_session.created", {
    tenantId: tenant.id,
    sessionId: session.id,
    accommodationId: body.accommodationId,
    ratePlanId: body.ratePlanId,
    status: initialStatus,
    hasAddons,
    totalNights: dateCheck.nights,
    accommodationTotal: ratePlan.totalPrice,
  });

  const redirect = hasAddons
    ? `/stays/${accommodation.slug}/addons`
    : "/checkout";

  return NextResponse.json({
    token,
    redirect,
    hasAddons,
  } satisfies CreateCheckoutSessionResponse);
}
