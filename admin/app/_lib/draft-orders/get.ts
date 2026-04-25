/**
 * Read-side service for draft-orders admin UI.
 * Returns Result<T,E> shape — matches existing orders/* read pattern.
 * Mutations in lifecycle.ts throw ServiceError — different convention by design.
 */

import type {
  DraftOrder,
  DraftLineItem,
  DraftOrderEvent,
  DraftReservation,
  GuestAccount,
} from "@prisma/client";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";

// ── Types ──────────────────────────────────────────────────────

export type DraftDetail = {
  draft: DraftOrder & { lineItems: DraftLineItem[] };
  events: DraftOrderEvent[];
  customer: GuestAccount | null;
  reservations: DraftReservation[];
  stripePaymentIntent: { id: string; status: string } | null;
  prev: { id: string; displayNumber: string } | null;
  next: { id: string; displayNumber: string } | null;
};

// ── getDraft ───────────────────────────────────────────────────

/**
 * Fetch a draft by id, scoped to tenant. Returns null when not found
 * OR when the draft belongs to a different tenant — these MUST be
 * indistinguishable to callers (no information leakage across tenants).
 *
 * Hydrates in parallel:
 *   - draft + lineItems + events + reservations (single findFirst with includes)
 *   - guestAccount (separate findFirst because the FK is loose / no @relation)
 *   - Stripe PaymentIntent status (only when draft.status === "INVOICED")
 *   - prev/next by displayNumber (two lightweight findFirst)
 */
export async function getDraft(
  draftId: string,
  tenantId: string,
): Promise<DraftDetail | null> {
  const draft = (await prisma.draftOrder.findFirst({
    where: { id: draftId, tenantId },
    include: {
      lineItems: { orderBy: { position: "asc" } },
      events: { orderBy: { createdAt: "desc" } },
      reservations: true,
    },
  })) as
    | (DraftOrder & {
        lineItems: DraftLineItem[];
        events: DraftOrderEvent[];
        reservations: DraftReservation[];
      })
    | null;

  if (!draft) return null;

  // Parallel hydration of the dependent reads. None of these can
  // re-leak the existence of the draft, so we only run them after
  // the existence/tenant check above.
  const guestAccountP =
    draft.guestAccountId !== null
      ? (prisma.guestAccount.findFirst({
          where: { id: draft.guestAccountId, tenantId },
        }) as Promise<GuestAccount | null>)
      : Promise.resolve<GuestAccount | null>(null);

  const stripeIntentP =
    draft.status === "INVOICED"
      ? fetchStripePaymentIntent(draft)
      : Promise.resolve<{ id: string; status: string } | null>(null);

  const prevP = prisma.draftOrder.findFirst({
    where: { tenantId, displayNumber: { lt: draft.displayNumber } },
    orderBy: { displayNumber: "desc" },
    select: { id: true, displayNumber: true },
  });

  const nextP = prisma.draftOrder.findFirst({
    where: { tenantId, displayNumber: { gt: draft.displayNumber } },
    orderBy: { displayNumber: "asc" },
    select: { id: true, displayNumber: true },
  });

  const [customer, stripePaymentIntent, prev, next] = await Promise.all([
    guestAccountP,
    stripeIntentP,
    prevP,
    nextP,
  ]);

  return {
    draft: {
      ...draft,
      lineItems: draft.lineItems,
    },
    events: draft.events,
    customer,
    reservations: draft.reservations,
    stripePaymentIntent,
    prev,
    next,
  };
}

// ── Stripe PI hydration (lazy, best-effort) ────────────────────

type DraftWithMetafields = Pick<DraftOrder, "tenantId" | "metafields">;

async function fetchStripePaymentIntent(
  draft: DraftWithMetafields,
): Promise<{ id: string; status: string } | null> {
  const piId = readStripePaymentIntentId(draft.metafields);
  if (piId === null) return null;

  try {
    const { getStripe } = await import("@/app/_lib/stripe/client");
    const stripe = getStripe();
    const tenant = await prisma.tenant.findUnique({
      where: { id: draft.tenantId },
      select: { stripeAccountId: true, stripeOnboardingComplete: true },
    });
    const devOrTest =
      process.env.NODE_ENV === "development" ||
      (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
    const connectParams =
      !devOrTest && tenant?.stripeAccountId && tenant.stripeOnboardingComplete
        ? { stripeAccount: tenant.stripeAccountId }
        : undefined;
    const pi = await stripe.paymentIntents.retrieve(piId, connectParams);
    return { id: pi.id, status: pi.status };
  } catch (err) {
    log("warn", "draft_order.get.stripe_pi_fetch_failed", {
      tenantId: draft.tenantId,
      stripePaymentIntentId: piId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function readStripePaymentIntentId(
  metafields: DraftOrder["metafields"],
): string | null {
  if (metafields === null || metafields === undefined) return null;
  if (typeof metafields !== "object" || Array.isArray(metafields)) return null;
  const v = (metafields as Record<string, unknown>).stripePaymentIntentId;
  return typeof v === "string" && v.length > 0 ? v : null;
}
