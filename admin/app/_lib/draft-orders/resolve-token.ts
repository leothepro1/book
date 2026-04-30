/**
 * Phase F — token-resolution helpers for `/invoice/[token]`.
 *
 * Implements `draft-orders-invoice-flow.md` v1.3 §7.2 — the
 * decision tree that maps a buyer-facing share-link token to one of
 * six fork states. Two helpers, both stateless beyond the explicit
 * DB read in `resolveDraftByToken`:
 *
 *   - `resolveDraftByToken` — global-unique token lookup with
 *     post-load tenant scoping. Cross-tenant token bleed returns
 *     null so the route handler renders 404.
 *   - `classifyTokenState` — pure function. Given a draft (or null)
 *     and the current time, returns the fork the route handler
 *     should render. No DB, no clock side-effects.
 *
 * The `fresh`/`resume` forks delegate to Phase E's
 * `createDraftCheckoutSession` at the route layer; this module
 * never calls into the lazy-creation pipeline. Invariant 10
 * (token resolution is read-only on no-state-change forks) holds
 * at this layer because the only state-changing path is the
 * `fresh`/`resume` delegation done by the caller.
 */

import type { DraftOrder } from "@prisma/client";

import { prisma } from "@/app/_lib/db/prisma";

// ── Public types ───────────────────────────────────────────────────

/**
 * Draft loaded with relations needed by the classifier and the
 * downstream status-page components. The shape is intentionally
 * narrow — only fields the classifier reads + fields the status
 * pages render. Phase F status pages don't load Prisma themselves.
 *
 * `activeSessions`: at most 1 row by partial-unique-index invariant
 * (v1.3 §3.1). Used to decide `resume` vs `fresh`.
 */
export type DraftForToken = DraftOrder & {
  lineItems: Array<{
    id: string;
    title: string;
    quantity: number;
    unitPriceCents: bigint;
    totalCents: bigint;
  }>;
  activeSessions: Array<{ id: string }>;
};

export type TokenState =
  | { kind: "not_found" }
  | { kind: "fresh"; draft: DraftForToken }
  | { kind: "resume"; draft: DraftForToken; activeSessionId: string }
  | { kind: "paid"; draft: DraftForToken; orderId: string }
  | { kind: "cancelled"; draft: DraftForToken }
  | { kind: "expired"; draft: DraftForToken };

// ── resolveDraftByToken ────────────────────────────────────────────

/**
 * Load a `DraftOrder` by `shareLinkToken`, scoped to a tenant.
 *
 * `shareLinkToken` is `String? @unique` globally, not per tenant
 * (`prisma/schema.prisma`). The unique index is enough to dedupe
 * tokens across the platform; tenant scoping is applied as a
 * post-load equality check so cross-tenant token bleed returns
 * `null` (rendered as 404 at the route) rather than an
 * unauthorized read.
 *
 * Returns the draft with line-item snapshots and any ACTIVE
 * `DraftCheckoutSession` rows in a single round trip. The route
 * handler passes the result through `classifyTokenState` and never
 * re-reads the draft — status pages take what they need from this
 * row via props.
 *
 * The relation alias `activeSessions` masks the schema's
 * `draftCheckoutSessions` field name so the rest of the codebase
 * doesn't need to know it.
 */
export async function resolveDraftByToken(
  token: string,
  tenantId: string,
): Promise<DraftForToken | null> {
  const draft = await prisma.draftOrder.findUnique({
    where: { shareLinkToken: token },
    include: {
      lineItems: {
        select: {
          id: true,
          title: true,
          quantity: true,
          unitPriceCents: true,
          totalCents: true,
        },
        orderBy: { position: "asc" },
      },
      draftCheckoutSessions: {
        where: { status: "ACTIVE" },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!draft || draft.tenantId !== tenantId) {
    return null;
  }

  // Project the schema's `draftCheckoutSessions` relation onto the
  // public `activeSessions` alias so callers don't depend on the
  // schema field name.
  const { draftCheckoutSessions, ...rest } = draft;
  return {
    ...rest,
    activeSessions: draftCheckoutSessions,
  } as DraftForToken;
}

// ── classifyTokenState ─────────────────────────────────────────────

/**
 * Map a loaded draft (or null) to the §7.2 decision-tree fork the
 * route handler should render.
 *
 * Pure function: no DB, no clock — `now` is injected so tests
 * exercise expiry boundaries deterministically.
 *
 * Decision order (top to bottom; first match wins):
 *
 *   1. `draft === null`                                      → not_found
 *   2. status in OPEN/PENDING_APPROVAL/APPROVED/REJECTED     → not_found
 *      (defensive: a token can only be set at sendInvoice time;
 *      if it resolves to a non-INVOICED draft, an invariant has
 *      been broken and 404 is safer than rendering a fork that
 *      was never designed for these statuses)
 *   3. status === CANCELLED                                  → cancelled
 *   4. status in PAID/COMPLETING/COMPLETED:
 *      - if `completedOrderId` is set                        → paid
 *      - else                                                → not_found
 *      (impossible state — `convertDraftToOrder` sets
 *      `completedOrderId` atomically with the PAID transition.
 *      Reaching here means an invariant has been broken; the
 *      route handler logs `error` and 404s rather than rendering
 *      a receipt page that has no order to render against.)
 *   5. status === OVERDUE                                    → expired
 *      (per invariant 15, OVERDUE drafts cannot be paid via the
 *      invoice URL; the merchant must transition them back to
 *      INVOICED first.)
 *   6. status === INVOICED:
 *      - `expiresAt <= now`                                  → expired
 *        (the link is dead. Even if an ACTIVE session exists, the
 *        buyer cannot complete payment past the draft's `expiresAt`
 *        — the cron sweeps the session itself in Phase I.)
 *      - else if any active session exists                   → resume
 *      - else                                                → fresh
 *
 * `DraftOrder.expiresAt` is non-nullable (`schema.prisma`); no null
 * branch is needed for INVOICED drafts.
 */
export function classifyTokenState(
  draft: DraftForToken | null,
  now: Date,
): TokenState {
  if (!draft) return { kind: "not_found" };

  switch (draft.status) {
    case "OPEN":
    case "PENDING_APPROVAL":
    case "APPROVED":
    case "REJECTED":
      return { kind: "not_found" };

    case "CANCELLED":
      return { kind: "cancelled", draft };

    case "PAID":
    case "COMPLETING":
    case "COMPLETED":
      if (!draft.completedOrderId) return { kind: "not_found" };
      return { kind: "paid", draft, orderId: draft.completedOrderId };

    case "OVERDUE":
      return { kind: "expired", draft };

    case "INVOICED": {
      if (draft.expiresAt.getTime() <= now.getTime()) {
        return { kind: "expired", draft };
      }
      const active = draft.activeSessions[0];
      if (active) {
        return { kind: "resume", draft, activeSessionId: active.id };
      }
      return { kind: "fresh", draft };
    }
  }
}
