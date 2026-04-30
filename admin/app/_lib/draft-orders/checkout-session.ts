/**
 * DraftOrder — lazy `DraftCheckoutSession` creation pipeline (Phase E).
 *
 * Implements `draft-orders-invoice-flow.md` v1.3 §7.3 — the buyer-side
 * pipeline that runs on the first GET of `/invoice/[token]` (route is
 * Phase F). Five steps:
 *
 *   1. Snapshot calculation via `computeDraftTotals`.
 *   2. `INSERT DraftCheckoutSession` (status=ACTIVE). Partial unique
 *      active-session index serializes concurrent inserts.
 *   3. PMS hold placement via `placeHoldsForDraft`.
 *   4. Stripe PaymentIntent creation via `initiateOrderPayment`
 *      (mode: embedded), forwarding `stripeIdempotencyKey` so a lost
 *      network response on retry produces the same PI rather than a
 *      duplicate (v1.3 §6.4).
 *   5. Persist PI ID + clientSecret onto the session row via CAS.
 *
 * Failures return a typed discriminated-union kind, never throw, so
 * Phase F's route can switch on `kind` without parsing exception
 * messages. Throws are reserved for programmer errors / impossible
 * states (sentry-captured automatically by `instrumentation.ts` when
 * they bubble to a request boundary).
 *
 * Defensive cleanup per v1.3 §6.4 "explicit per-step compensation":
 * each failure runs a fresh-tx CAS to CANCELLED + best-effort
 * external cleanup (release placed PMS holds, cancel the Stripe PI
 * if step 4 succeeded). The watchdog cron (Phase I) is the safety
 * net for genuine process crashes between steps 2 and 5.
 *
 * NOT in this module's scope:
 *   - `/invoice/[token]` route classification (Phase F)
 *   - `/checkout?draftSession={id}` buyer page (Phase F)
 *   - watchdog cron for orphan ACTIVE sessions (Phase I)
 *   - merchant-side `unlinkActiveCheckoutSession` (Phase D, complete).
 */

import { randomBytes } from "node:crypto";
import { Prisma, type DraftCheckoutSession } from "@prisma/client";

import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import { NotFoundError } from "@/app/_lib/errors/service-errors";
import { isServiceError } from "@/app/_lib/errors/service-errors";
import { getTenantUrl } from "@/app/_lib/tenant/tenant-url";
import { computeIdempotencyKey } from "@/app/_lib/integrations/reliability/idempotency";
import { computeDraftTotals } from "./calculator/orchestrator";
import { placeHoldsForDraft } from "./holds";
import { initiateOrderPayment } from "@/app/_lib/payments/providers/initiate";
import { assertTenantStripeReady } from "@/app/_lib/stripe/verify-account";

// ── Public types ───────────────────────────────────────────────────

export type CreateDraftCheckoutSessionResult =
  | {
      kind: "created";
      sessionId: string;
      clientSecret: string;
      redirectUrl: string;
    }
  | {
      kind: "resumed";
      sessionId: string;
      clientSecret: string;
      redirectUrl: string;
    }
  | { kind: "unit_unavailable"; reason: string }
  | { kind: "stripe_unavailable"; reason: string }
  | { kind: "tenant_not_ready"; reason: string }
  | { kind: "draft_not_payable"; reason: string };

// ── Constants ──────────────────────────────────────────────────────

const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24h hard cap (v1.3 §7.4)
const ORPHAN_AGE_THRESHOLD_MS = 30 * 1000; // §6.4 + §7.5
const RACE_LOSER_POLL_ATTEMPTS = 3;
const RACE_LOSER_POLL_INTERVAL_MS = 250;
const PHASE_E_LOCALE = "sv-SE"; // Apelviken pilot default; revisit at Phase F

// ── Public API ─────────────────────────────────────────────────────

/**
 * Lazy creation of a `DraftCheckoutSession` for an `INVOICED` draft.
 *
 * Defensive structural validation runs first so a misclassified call
 * never inserts a session row. Tenant Stripe-readiness is checked
 * before step 1 so we never burn a snapshot on a tenant that can't
 * accept charges. The five-step pipeline runs only after both gates
 * pass.
 */
export async function createDraftCheckoutSession(
  tenantId: string,
  draftOrderId: string,
): Promise<CreateDraftCheckoutSessionResult> {
  // ── Pre-pipeline: structural payability ──
  const draft = await loadDraftForSession(tenantId, draftOrderId);

  if (draft.status !== "INVOICED") {
    return { kind: "draft_not_payable", reason: "status_not_invoiced" };
  }
  if (draft.expiresAt && draft.expiresAt.getTime() <= Date.now()) {
    return { kind: "draft_not_payable", reason: "draft_expired" };
  }
  if (draft.lineItems.length === 0) {
    return { kind: "draft_not_payable", reason: "no_line_items" };
  }
  if (!draft.currency) {
    return { kind: "draft_not_payable", reason: "invalid_currency" };
  }

  const buyer = await resolveBuyer(draft);
  if (!buyer) {
    return { kind: "draft_not_payable", reason: "missing_buyer_email" };
  }

  // ── Tenant readiness (v1.3 §7.3 step 4 prerequisite) ──
  // Loaded eagerly because `assertTenantStripeReady` needs portalSlug,
  // which is also used to build the buyer redirect URL on success.
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      portalSlug: true,
      stripeAccountId: true,
      stripeOnboardingComplete: true,
    },
  });
  if (!tenant) {
    throw new NotFoundError("Tenant not found", { tenantId });
  }
  try {
    await assertTenantStripeReady(tenant);
  } catch (err) {
    if (isServiceError(err) && err.code === "VALIDATION") {
      const reason =
        (err.context?.reason as string | undefined) ?? err.message;
      return { kind: "tenant_not_ready", reason };
    }
    throw err;
  }
  // After the gate, `tenant.portalSlug` is non-null by contract.
  const portalSlug = tenant.portalSlug as string;

  // ── Resume short-circuit: existing healthy ACTIVE session ──
  const existing = await findActiveSession(tenantId, draftOrderId);
  if (existing && existing.stripePaymentIntentId && existing.stripeClientSecret) {
    log("info", "draft_invoice.session_resumed", {
      tenantId,
      draftOrderId,
      sessionId: existing.id,
    });
    return {
      kind: "resumed",
      sessionId: existing.id,
      clientSecret: existing.stripeClientSecret,
      redirectUrl: buildBuyerCheckoutUrl(portalSlug, existing.id),
    };
  }

  // ── Step 1: snapshot ──
  // Computed in a fresh tx so the orchestrator's reads are consistent.
  const totals = await prisma.$transaction(async (tx) =>
    computeDraftTotals(tenantId, draftOrderId, {}, tx),
  );

  if (totals.totalCents <= BigInt(0)) {
    return { kind: "draft_not_payable", reason: "zero_or_negative_total" };
  }

  // ── Step 2: session insert (with P2002 + orphan handling) ──
  const nonce = randomBytes(16).toString("hex");
  const stripeIdempotencyKey = computeIdempotencyKey({
    tenantId,
    provider: "stripe",
    operation: "createDraftCheckoutSessionPI",
    inputs: {
      draftId: draftOrderId,
      version: draft.version,
      nonce,
    },
  });
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  const sessionData = {
    tenantId,
    draftOrderId,
    draftOrderVersion: draft.version,
    status: "ACTIVE" as const,
    frozenSubtotal: totals.subtotalCents,
    frozenTaxAmount: totals.taxCents,
    frozenDiscountAmount: totals.orderDiscountCents,
    frozenTotal: totals.totalCents,
    currency: totals.currency,
    stripeIdempotencyKey,
    expiresAt,
    lastBuyerActivityAt: new Date(),
  };

  let session: DraftCheckoutSession;
  try {
    session = await prisma.draftCheckoutSession.create({ data: sessionData });
  } catch (err) {
    if (isP2002(err)) {
      const collision = await handleOrphanCollision(
        tenantId,
        draftOrderId,
        portalSlug,
      );
      if (collision.kind === "resumed") return collision.result;
      // collision.kind === "cancelled" → retry insert exactly once.
      try {
        session = await prisma.draftCheckoutSession.create({
          data: sessionData,
        });
        log("info", "draft_invoice.session_orphan_reused", {
          tenantId,
          draftOrderId,
          previousSessionId: collision.previousSessionId,
        });
      } catch (retryErr) {
        // A second P2002 means a concurrent writer beat the orphan
        // cleanup AND also raced ahead of us. This is a programmer
        // error / unexpected state — throw so the framework Sentry
        // hook captures it.
        throw new Error(
          `createDraftCheckoutSession: P2002 on orphan-retry for draft ${draftOrderId}`,
          { cause: retryErr },
        );
      }
    } else {
      throw err;
    }
  }

  // ── Step 3: hold placement ──
  const holdResult = await placeHoldsForDraft({
    tenantId,
    draftOrderId,
    actorUserId: undefined,
  });
  // Strict failure threshold (Q4 confirmed): any failed OR skipped
  // line means the buyer cannot pay. A draft mixing PMS-synced and
  // non-PMS lines is a merchant authoring error; better to block and
  // surface "contact hotel" than to take a partial payment.
  if (holdResult.failed.length > 0 || holdResult.skipped.length > 0) {
    const reason =
      holdResult.failed[0]?.error ??
      holdResult.skipped[0]?.reason ??
      "hold_placement_failed";
    await compensateAfterStep3(
      tenantId,
      session.id,
      holdResult.placed.map((h) => h.holdExternalId),
    );
    log("info", "draft_invoice.session_cancelled", {
      tenantId,
      draftOrderId,
      sessionId: session.id,
      reason: "hold_placement_failed",
      detail: reason,
    });
    return { kind: "unit_unavailable", reason };
  }

  const placedHoldIds = holdResult.placed.map((h) => h.holdExternalId);

  // ── Step 4: PI creation ──
  // `idempotencyKey` is forwarded to `stripe.paymentIntents.create`
  // via the bedfront-payments adapter (Phase E extension to
  // PaymentSessionRequest). `metadata.kind = "draft_order_invoice"`
  // signals to the Phase H webhook handler that this PI maps to a
  // DraftCheckoutSession, not a D2C Order.
  let piInit: Awaited<ReturnType<typeof initiateOrderPayment>>;
  try {
    piInit = await initiateOrderPayment({
      order: {
        id: session.id,
        tenantId,
        totalAmount: Number(totals.totalCents),
        currency: totals.currency,
      },
      guest: { email: buyer.email, name: buyer.name },
      locale: PHASE_E_LOCALE,
      returnUrl: buildBuyerCheckoutUrl(portalSlug, session.id),
      idempotencyKey: stripeIdempotencyKey,
      metadata: {
        kind: "draft_order_invoice",
        draftOrderId,
        draftCheckoutSessionId: session.id,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await compensateAfterStep4(tenantId, session.id, placedHoldIds);
    log("info", "draft_invoice.session_cancelled", {
      tenantId,
      draftOrderId,
      sessionId: session.id,
      reason: "pi_create_failed",
      error: message,
    });
    return { kind: "stripe_unavailable", reason: message };
  }

  if (piInit.mode !== "embedded") {
    // Defensive: bedfront-payments returns "redirect" only when
    // metadata.checkoutMode === "session". We don't set that, so this
    // branch is structurally unreachable. Treat as stripe_unavailable
    // and clean up if the adapter's contract ever drifts.
    await compensateAfterStep4(tenantId, session.id, placedHoldIds);
    log("info", "draft_invoice.session_cancelled", {
      tenantId,
      draftOrderId,
      sessionId: session.id,
      reason: "non_embedded_mode_returned",
    });
    return {
      kind: "stripe_unavailable",
      reason: "non_embedded_mode_returned",
    };
  }

  const paymentIntentId = piInit.providerSessionId;
  if (!paymentIntentId) {
    // Stripe always returns a PI id for embedded mode; this would
    // mean the adapter contract is broken. Treat as a step-5-class
    // failure (cleanup + cancel) and surface as stripe_unavailable.
    await compensateAfterStep4(tenantId, session.id, placedHoldIds);
    return {
      kind: "stripe_unavailable",
      reason: "missing_payment_intent_id",
    };
  }

  // ── Step 5: persist PI ID + clientSecret onto the session row ──
  // CAS on `status: "ACTIVE"` so a watchdog or merchant-unlink that
  // raced ahead doesn't get its terminal state overwritten.
  const persisted = await prisma.draftCheckoutSession.updateMany({
    where: { id: session.id, status: "ACTIVE" },
    data: {
      stripePaymentIntentId: paymentIntentId,
      stripeClientSecret: piInit.clientSecret,
    },
  });
  if (persisted.count === 0) {
    await compensateAfterStep5(
      tenantId,
      session.id,
      paymentIntentId,
      placedHoldIds,
    );
    log("info", "draft_invoice.session_cancelled", {
      tenantId,
      draftOrderId,
      sessionId: session.id,
      reason: "pi_persist_cas_lost",
    });
    return {
      kind: "stripe_unavailable",
      reason: "session_no_longer_active",
    };
  }

  log("info", "draft_invoice.session_created", {
    tenantId,
    draftOrderId,
    sessionId: session.id,
    totalCents: totals.totalCents.toString(),
    currency: totals.currency,
  });
  return {
    kind: "created",
    sessionId: session.id,
    clientSecret: piInit.clientSecret,
    redirectUrl: buildBuyerCheckoutUrl(portalSlug, session.id),
  };
}

// ── Loaders ────────────────────────────────────────────────────────

type DraftWithLines = Awaited<ReturnType<typeof loadDraftForSession>>;

async function loadDraftForSession(tenantId: string, draftOrderId: string) {
  const draft = await prisma.draftOrder.findFirst({
    where: { id: draftOrderId, tenantId },
    include: { lineItems: { select: { id: true } } },
  });
  if (!draft) {
    throw new NotFoundError("DraftOrder not found in tenant", {
      tenantId,
      draftOrderId,
    });
  }
  return draft;
}

async function findActiveSession(
  tenantId: string,
  draftOrderId: string,
): Promise<DraftCheckoutSession | null> {
  return prisma.draftCheckoutSession.findFirst({
    where: { tenantId, draftOrderId, status: "ACTIVE" },
  });
}

// ── Buyer resolution ───────────────────────────────────────────────

interface ResolvedBuyer {
  email: string;
  /** Real name when available; falls back to the email itself. */
  name: string;
}

/**
 * Resolve buyer email + name from a loaded draft. Phase E follows
 * the defense-in-depth pattern: re-check structurally even though
 * sendInvoice's S5 precondition should have validated upstream.
 *
 * Resolution order — **snapshot-first**, matching sendInvoice's
 * print-time semantics so invoice-time and pay-time use the same
 * inbox:
 *
 *   1. `draft.contactEmail` (snapshot, frozen at draft creation).
 *      Name from `contactFirstName + contactLastName` snapshot →
 *      email-as-name fallback.
 *   2. `draft.guestAccountId` set → `GuestAccount.email` fallback
 *      when the snapshot is null/empty. Name from `firstName +
 *      lastName` → deprecated `name` → email-as-name.
 *   3. → `null` → caller surfaces
 *      `draft_not_payable("missing_buyer_email")`.
 *
 * **Why snapshot-first.** The merchant set `contactEmail` at draft
 * creation as their explicit intent — that's the address the
 * invoice email went to. The buyer who clicks the invoice link is
 * by definition the recipient at that address; the receipt must
 * hit the same inbox or the audit trail diverges (invoice to A,
 * receipt to B for no merchant-visible reason). The fail-case the
 * snapshot prevents: hotel staff receive a phone call from "John",
 * snapshot `contactEmail = john@new.com`, but John's stale
 * `GuestAccount.email = john@old.com` from a different tenant's
 * Bedfront flow. Live-precedence would silently route the receipt
 * to the address the staff never intended to use. Invariant 17
 * already freezes pricing into the session for the same reason —
 * buyer email belongs in the same category.
 *
 * `companyContactId` is NOT walked. `CompanyContact` has no
 * `email` column (verified against schema); the underlying
 * GuestAccount could be reached via
 * `companyContact.guestAccountId` but the project rule is "no
 * relation-walk to models without an email column" — drafts that
 * are B2B-only (no `guestAccountId`, no `contactEmail`) fall
 * through to `draft_not_payable`. In the standard B2B flow,
 * sendInvoice's S5 precondition guarantees `contactEmail` is
 * populated before the draft reaches INVOICED, so this isn't a
 * buyer-blocking case.
 *
 * `DraftOrder` uses loose FKs to GuestAccount (no `@relation` —
 * schema design intent: archival of the linked entity never
 * cascades into drafts). The conditional `findUnique` here is
 * therefore a separate sub-millisecond PK lookup, not a Prisma
 * `include`. Zero extra queries on the common path (snapshot
 * present); one extra query only when the snapshot is null and
 * the GuestAccount fallback is exercised.
 */
async function resolveBuyer(draft: {
  contactEmail: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  guestAccountId: string | null;
}): Promise<ResolvedBuyer | null> {
  if (draft.contactEmail && draft.contactEmail.length > 0) {
    const snapshotName =
      [draft.contactFirstName, draft.contactLastName]
        .filter(Boolean)
        .join(" ")
        .trim() || draft.contactEmail;
    return { email: draft.contactEmail, name: snapshotName };
  }

  if (draft.guestAccountId) {
    const guest = await prisma.guestAccount.findUnique({
      where: { id: draft.guestAccountId },
      select: { email: true, firstName: true, lastName: true, name: true },
    });
    if (guest && guest.email) {
      const fullName =
        [guest.firstName, guest.lastName].filter(Boolean).join(" ").trim() ||
        guest.name ||
        guest.email;
      return { email: guest.email, name: fullName };
    }
    // Fall through: linked guest record vanished or has no email →
    // no further fallback, surface as missing_buyer_email below.
  }

  return null;
}

// ── Orphan-collision handling (v1.3 §6.4 + §7.5) ───────────────────

type OrphanCollisionOutcome =
  | {
      kind: "resumed";
      result: CreateDraftCheckoutSessionResult;
    }
  | { kind: "cancelled"; previousSessionId: string };

/**
 * Called when a session insert hits the partial unique active-session
 * index. Three cases per v1.3 §6.4:
 *
 *   - existing session has a PI → resume (return clientSecret)
 *   - existing session is fresh (< 30s) without a PI → race-loser
 *     case per §7.5: poll briefly for the winner to populate, then
 *     resume. If it never populates within the bounded poll window
 *     the winner crashed mid-pipeline; throw so the framework Sentry
 *     hook reports the unexpected race.
 *   - existing session is older than 30s without a PI → orphan:
 *     CAS to CANCELLED then signal caller to retry insert exactly
 *     once. If the CAS finds count=0 a concurrent writer beat us
 *     to cancellation — re-read and re-decide rather than retry
 *     blind.
 *
 * Throws on both "no active session at all" (P2002 collision but
 * findFirst returned null — impossible-state) and on race-loser
 * poll exhaustion. Either case is sentry-worthy.
 */
async function handleOrphanCollision(
  tenantId: string,
  draftOrderId: string,
  portalSlug: string,
): Promise<OrphanCollisionOutcome> {
  for (let attempt = 0; attempt < RACE_LOSER_POLL_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(RACE_LOSER_POLL_INTERVAL_MS);
    const existing = await findActiveSession(tenantId, draftOrderId);

    if (!existing) {
      // P2002 said an active session exists, findFirst says it doesn't.
      // Either a concurrent writer just transitioned it to a terminal
      // state, or the row vanished (impossible). Re-poll within the
      // bounded window; if still nothing, fall through to throw below.
      continue;
    }

    // Case A — has PI: resume immediately, no further polling needed.
    if (existing.stripePaymentIntentId && existing.stripeClientSecret) {
      log("info", "draft_invoice.session_resumed", {
        tenantId,
        draftOrderId,
        sessionId: existing.id,
      });
      return {
        kind: "resumed",
        result: {
          kind: "resumed",
          sessionId: existing.id,
          clientSecret: existing.stripeClientSecret,
          redirectUrl: buildBuyerCheckoutUrl(portalSlug, existing.id),
        },
      };
    }

    const ageMs = Date.now() - existing.createdAt.getTime();

    // Case B — orphan (>30s old, no PI). CAS-cancel and signal retry.
    if (ageMs > ORPHAN_AGE_THRESHOLD_MS) {
      const cancelled = await casCancelSession(
        existing.id,
        "orphan_pre_pi",
      );
      if (cancelled) {
        return { kind: "cancelled", previousSessionId: existing.id };
      }
      // count===0 → another writer beat us; loop and re-decide.
      log("warn", "draft_invoice.session_cancel_cas_lost", {
        tenantId,
        draftOrderId,
        sessionId: existing.id,
        context: "orphan_collision",
      });
      continue;
    }

    // Case C — fresh (<30s) without PI: race-loser. Brief poll for
    // the winner to populate before giving up.
  }

  throw new Error(
    `createDraftCheckoutSession: orphan-collision unresolved for draft ${draftOrderId} after ${RACE_LOSER_POLL_ATTEMPTS} attempts`,
  );
}

// ── Compensation helpers (v1.3 §6.4 explicit per-step cleanup) ─────

async function compensateAfterStep3(
  tenantId: string,
  sessionId: string,
  placedHoldIds: string[],
): Promise<void> {
  await casCancelSession(sessionId, "hold_placement_failed");
  await releaseHoldsBestEffort(tenantId, sessionId, placedHoldIds);
}

async function compensateAfterStep4(
  tenantId: string,
  sessionId: string,
  placedHoldIds: string[],
): Promise<void> {
  await casCancelSession(sessionId, "pi_create_failed");
  // No Stripe action — the PI was never persisted on our side, and
  // the idempotency key guarantees a future retry produces the same
  // PI rather than a duplicate. Stripe's 24h auto-cancel on
  // uncaptured PIs is the safety net for the lost-response edge
  // case where the API call partially succeeded.
  await releaseHoldsBestEffort(tenantId, sessionId, placedHoldIds);
}

async function compensateAfterStep5(
  tenantId: string,
  sessionId: string,
  paymentIntentId: string,
  placedHoldIds: string[],
): Promise<void> {
  await casCancelSession(sessionId, "pi_persist_failed");
  await tryCancelStripePI(tenantId, sessionId, paymentIntentId);
  await releaseHoldsBestEffort(tenantId, sessionId, placedHoldIds);
}

/**
 * CAS-mark a session CANCELLED. Returns true on success, false when
 * a concurrent writer (watchdog cron, merchant unlink, another
 * compensator) beat us to a terminal state. Never throws; on a DB
 * error the caller's compensation continues so external state still
 * gets cleaned up.
 */
async function casCancelSession(
  sessionId: string,
  reason: string,
): Promise<boolean> {
  try {
    const updated = await prisma.draftCheckoutSession.updateMany({
      where: { id: sessionId, status: "ACTIVE" },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        unlinkReason: reason,
      },
    });
    return updated.count === 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("warn", "draft_invoice.session_cancel_failed", {
      sessionId,
      reason,
      error: message,
    });
    return false;
  }
}

/**
 * Best-effort PMS hold release for compensation. Mirrors
 * `runUnlinkSideEffects` (Phase D): lazy-import the adapter resolver
 * so test environments without PMS env vars can import this module
 * freely; never throws.
 */
async function releaseHoldsBestEffort(
  tenantId: string,
  sessionId: string,
  holdExternalIds: string[],
): Promise<void> {
  if (holdExternalIds.length === 0) return;
  let adapter: { releaseHold(tenantId: string, holdExternalId: string): Promise<unknown> };
  try {
    const { resolveAdapter } = await import(
      "@/app/_lib/integrations/resolve"
    );
    adapter = (await resolveAdapter(tenantId)) as typeof adapter;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("warn", "draft_invoice.hold_release_resolve_failed", {
      tenantId,
      sessionId,
      error: message,
    });
    return;
  }
  for (const holdExternalId of holdExternalIds) {
    try {
      await adapter.releaseHold(tenantId, holdExternalId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log("warn", "draft_invoice.hold_release_failed", {
        tenantId,
        sessionId,
        holdExternalId,
        error: message,
      });
    }
  }
}

/**
 * Best-effort Stripe PI cancel for step-5 compensation. Mirrors the
 * Connect-detection logic in `runUnlinkSideEffects`: dev/test mode
 * skips Connect routing; non-dev attaches `stripeAccount` when the
 * tenant is onboarded. Failure is logged, never thrown — Stripe's
 * 24h auto-cancel on uncaptured PIs is the safety net.
 */
async function tryCancelStripePI(
  tenantId: string,
  sessionId: string,
  paymentIntentId: string,
): Promise<void> {
  try {
    const { getStripe } = await import("@/app/_lib/stripe/client");
    const stripe = getStripe();
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { stripeAccountId: true, stripeOnboardingComplete: true },
    });
    const devOrTest =
      process.env.NODE_ENV === "development" ||
      (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
    const connectParams =
      !devOrTest && tenant?.stripeAccountId && tenant.stripeOnboardingComplete
        ? { stripeAccount: tenant.stripeAccountId }
        : undefined;
    await stripe.paymentIntents.cancel(paymentIntentId, connectParams);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("warn", "draft_invoice.pi_cancel_failed", {
      tenantId,
      sessionId,
      paymentIntentId,
      error: message,
    });
  }
}

// ── Misc ───────────────────────────────────────────────────────────

function buildBuyerCheckoutUrl(portalSlug: string, sessionId: string): string {
  return getTenantUrl(
    { portalSlug },
    { path: `/checkout?draftSession=${sessionId}` },
  );
}

function isP2002(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Type-only import-anchors so unused imports don't trip lint when
// only the runtime values are referenced above.
void ({} as DraftWithLines);
