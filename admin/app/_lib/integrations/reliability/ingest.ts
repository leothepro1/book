/**
 * PMS Reliability Engine — Ingestion Chokepoint
 * ═════════════════════════════════════════════════
 *
 * `upsertBookingFromPms()` is the ONLY path into the Booking table from
 * a PMS. Every caller — webhook handler, reconciliation cron, manual
 * admin tool — routes here. This single point of entry is what makes
 * the system behave correctly under the race conditions that plague
 * distributed booking systems:
 *
 *   • Two webhooks for the same booking arriving concurrently
 *   • A webhook arriving while the cron is backfilling the same booking
 *   • A delayed webhook carrying older state than what's already stored
 *   • A crash after write but before ack; same webhook retried
 *
 * The guarantees this function provides, in order of importance:
 *
 *   1. Exactly-once semantics keyed on (tenantId, externalId).
 *      Two concurrent calls for the same key serialize: one wins the
 *      row lock, the other sees the winner's result. Retries of the
 *      same event are no-ops.
 *
 *   2. Monotonic version progression. `providerUpdatedAt` is the
 *      version vector. An incoming write whose version is ≤ the
 *      stored version is rejected as stale — newer state is never
 *      overwritten by older.
 *
 *   3. Atomic state transition. The booking row update and the
 *      surrounding transaction commit as one unit. A crash mid-write
 *      leaves the DB in its prior consistent state.
 *
 *   4. Non-blocking audit. The SyncEvent write and structured log
 *      happen AFTER transaction commit. If they fail, the booking
 *      still landed — audit is secondary to data integrity.
 *
 *   5. Transient-failure recovery. Serialization failures, deadlocks,
 *      and unique-constraint races (two-writer insert collision) are
 *      retried automatically with jittered backoff.
 *
 * Non-goals (intentionally NOT handled here):
 *
 *   • Rate limiting — callers (webhook + cron) own their own budgets.
 *   • Circuit breaker — callers check before calling.
 *   • Email/sync side-effects — a separate trigger layer subscribes
 *     to SyncEvent or inspects action codes post-return.
 *   • Deletion — PMS bookings are never hard-deleted; CANCELLED is
 *     just another status transition.
 */

import { prisma } from "@/app/_lib/db/prisma";
import { Prisma, type BookingStatus } from "@prisma/client";
import { emitAnalyticsEvent } from "@/app/_lib/analytics/pipeline/emitter";
import {
  derivePMSAdapterType,
  formatAnalyticsDate,
  type PMSProvider,
} from "@/app/_lib/analytics/pipeline/integrations";
import { log } from "@/app/_lib/logger";
import { setSentryTenantContext } from "@/app/_lib/observability/sentry";
import { logSyncEvent } from "../sync/log";
import {
  BookingUpsertInputSchema,
  type BookingUpsertInput,
  type IngestStatus,
  type UpsertAction,
  type UpsertResult,
} from "./types";

// ── Retry policy for transient transaction failures ─────────
//
// Postgres 40001 (serialization_failure) and 40P01 (deadlock_detected)
// are the canonical retry signals. Prisma surfaces them as P2034, plus
// its own P2002 on concurrent unique-constraint collision which is also
// a "retry — the other writer beat us to the insert" condition.
//
// Backoff: 50ms, 150ms, 450ms with ±30% jitter. Max 3 attempts total.
// Beyond 3, the caller sees the error and decides (webhook: 5xx so PMS
// retries; cron: log + BookingSyncError row).

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 50;
const JITTER_RATIO = 0.3;

const RETRYABLE_PRISMA_CODES = new Set([
  "P2002", // unique constraint (concurrent insert race)
  "P2034", // transaction failed due to write conflict / deadlock
]);

function isRetryable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_PRISMA_CODES.has(err.code);
  }
  // Raw SQL serialization failures surface as PrismaClientUnknownRequestError.
  // Match by SQLSTATE embedded in message.
  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    const msg = err.message ?? "";
    return msg.includes("40001") || msg.includes("40P01");
  }
  return false;
}

async function sleepJittered(baseMs: number): Promise<void> {
  const jitter = 1 + (Math.random() * 2 - 1) * JITTER_RATIO;
  const delay = Math.max(1, Math.round(baseMs * jitter));
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// ── Adapter-status → Prisma BookingStatus ──────────────────

function mapIngestStatus(status: IngestStatus): BookingStatus {
  switch (status) {
    case "confirmed":
      return "PRE_CHECKIN";
    case "checked_in":
      return "ACTIVE";
    case "checked_out":
      return "COMPLETED";
    case "cancelled":
      return "CANCELLED";
    case "no_show":
      // No dedicated NO_SHOW enum value. Map to CANCELLED and mark the
      // no-show nuance in the SyncEvent payload for audit.
      return "CANCELLED";
  }
}

// ── Existing-row shape fetched under FOR UPDATE ─────────────
//
// Only the fields the diff compares against are selected. Keeping the
// projection tight minimizes the page size Postgres has to lock and the
// bandwidth on the wire.

interface ExistingBookingRow {
  id: string;
  providerUpdatedAt: Date | null;
  firstName: string;
  lastName: string;
  guestEmail: string;
  phone: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  arrival: Date;
  departure: Date;
  unit: string;
  status: BookingStatus;
}

async function selectForUpdate(
  tx: Prisma.TransactionClient,
  tenantId: string,
  externalId: string,
): Promise<ExistingBookingRow | null> {
  const rows = await tx.$queryRaw<ExistingBookingRow[]>`
    SELECT
      "id",
      "providerUpdatedAt",
      "firstName",
      "lastName",
      "guestEmail",
      "phone",
      "street",
      "postalCode",
      "city",
      "country",
      "arrival",
      "departure",
      "unit",
      "status"
    FROM "Booking"
    WHERE "tenantId" = ${tenantId}
      AND "externalId" = ${externalId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

// ── Field-level diff ────────────────────────────────────────
//
// A "real" change triggers action="updated" and downstream side-effects
// (e.g., re-send confirmation emails). Identical data with only a new
// providerUpdatedAt triggers action="unchanged_identical" — we still
// advance the version but the downstream gets no re-notification.

function bookingsIdentical(
  existing: ExistingBookingRow,
  input: BookingUpsertInput,
): boolean {
  const mappedStatus = mapIngestStatus(input.status);
  return (
    existing.firstName === input.guest.firstName &&
    existing.lastName === input.guest.lastName &&
    existing.guestEmail === input.guest.email &&
    existing.phone === (input.guest.phone ?? null) &&
    existing.street === (input.guest.street ?? null) &&
    existing.postalCode === (input.guest.postalCode ?? null) &&
    existing.city === (input.guest.city ?? null) &&
    existing.country === (input.guest.country ?? null) &&
    existing.unit === input.stay.unit &&
    existing.status === mappedStatus &&
    existing.arrival.getTime() === input.stay.checkIn.getTime() &&
    existing.departure.getTime() === input.stay.checkOut.getTime()
  );
}

// ── One attempt at the upsert transaction ───────────────────

async function executeUpsertOnce(
  input: BookingUpsertInput,
): Promise<UpsertResult> {
  return await prisma.$transaction(async (tx) => {
    const existing = await selectForUpdate(
      tx,
      input.tenantId,
      input.externalId,
    );

    const now = new Date();
    const mappedStatus = mapIngestStatus(input.status);

    // ── Case 1: INSERT ────────────────────────────────────
    // No existing row. Insert, relying on the externalId unique
    // constraint as the race guard. If a concurrent writer inserts
    // first, the caller (retry loop) re-enters and takes the UPDATE
    // path on the next attempt.

    if (!existing) {
      const created = await tx.booking.create({
        data: {
          tenantId: input.tenantId,
          externalId: input.externalId,
          externalSource: input.provider,
          providerUpdatedAt: input.providerUpdatedAt,
          lastSyncedAt: now,

          firstName: input.guest.firstName,
          lastName: input.guest.lastName,
          guestEmail: input.guest.email,
          phone: input.guest.phone ?? null,

          street: input.guest.street ?? null,
          postalCode: input.guest.postalCode ?? null,
          city: input.guest.city ?? null,
          country: input.guest.country ?? null,

          arrival: input.stay.checkIn,
          departure: input.stay.checkOut,
          checkIn: input.stay.checkIn,
          checkOut: input.stay.checkOut,
          unit: input.stay.unit,
          guestCount: input.stay.guestCount ?? null,
          specialRequests: input.stay.specialRequests ?? null,
          ratePlanId: input.stay.ratePlanId ?? null,
          pmsBookingRef: input.stay.pmsBookingRef ?? null,

          status: mappedStatus,
        },
        select: { id: true, createdAt: true },
      });

      const recoveryLagMs = input.providerCreatedAt
        ? created.createdAt.getTime() - input.providerCreatedAt.getTime()
        : undefined;

      // booking_imported analytics emit (Phase 2). Transactional — if the
      // ingest tx aborts, the outbox row never lands. PMS-imported bookings
      // get a separate event from booking_completed (which fires for direct
      // bookings via processOrderPaidSideEffects); see
      // docs/analytics/event-catalog.md.
      await emitAnalyticsEvent(tx, {
        tenantId: input.tenantId,
        eventName: "booking_imported",
        schemaVersion: "0.1.0",
        occurredAt: input.providerUpdatedAt,
        actor: { actor_type: "system", actor_id: null },
        payload: {
          booking_id: created.id,
          pms_provider: derivePMSAdapterType(input.provider) as PMSProvider,
          pms_reference: input.externalId,
          check_in_date: formatAnalyticsDate(input.stay.checkIn),
          check_out_date: formatAnalyticsDate(input.stay.checkOut),
          number_of_nights: pmsBookingNights(input.stay.checkIn, input.stay.checkOut),
          number_of_guests: input.stay.guestCount ?? null,
          accommodation_id: null,
          guest_email_hash: pmsBookingGuestEmailHash(
            input.tenantId,
            input.guest.email,
          ),
        },
        idempotencyKey: `booking_imported:${created.id}`,
      });

      return {
        action: "created" satisfies UpsertAction,
        bookingId: created.id,
        tenantId: input.tenantId,
        externalId: input.externalId,
        ...(recoveryLagMs !== undefined ? { recoveryLagMs } : {}),
      };
    }

    // ── Case 2: STALE — incoming version not newer than stored ──
    // The row is locked; if we see an older version, some other
    // writer already applied a newer one. Drop this write silently
    // but record a SyncEvent (outside the tx) so the SLO dashboard
    // can count stale rejections per provider.

    if (
      existing.providerUpdatedAt !== null &&
      input.providerUpdatedAt.getTime() <= existing.providerUpdatedAt.getTime()
    ) {
      return {
        action: "unchanged_stale" satisfies UpsertAction,
        bookingId: existing.id,
        tenantId: input.tenantId,
        externalId: input.externalId,
      };
    }

    // ── Case 3: IDENTICAL — version is newer but content didn't change ──
    // Advance the version vector (so future stale-check works) and the
    // lastSyncedAt heartbeat, but skip the downstream "updated" signal
    // so we don't flood email triggers on every reconciliation sweep.

    if (bookingsIdentical(existing, input)) {
      await tx.booking.update({
        where: { id: existing.id },
        data: {
          providerUpdatedAt: input.providerUpdatedAt,
          lastSyncedAt: now,
        },
      });

      return {
        action: "unchanged_identical" satisfies UpsertAction,
        bookingId: existing.id,
        tenantId: input.tenantId,
        externalId: input.externalId,
      };
    }

    // ── Case 4: UPDATE — real content change ──────────────
    // Row locked, version strictly newer, content differs. Apply all
    // fields in one update. The write is atomic with the FOR UPDATE
    // in the same transaction, so no interleaving writer can slip
    // between our read and our write.

    await tx.booking.update({
      where: { id: existing.id },
      data: {
        providerUpdatedAt: input.providerUpdatedAt,
        lastSyncedAt: now,
        externalSource: input.provider,

        firstName: input.guest.firstName,
        lastName: input.guest.lastName,
        guestEmail: input.guest.email,
        phone: input.guest.phone ?? null,

        street: input.guest.street ?? null,
        postalCode: input.guest.postalCode ?? null,
        city: input.guest.city ?? null,
        country: input.guest.country ?? null,

        arrival: input.stay.checkIn,
        departure: input.stay.checkOut,
        checkIn: input.stay.checkIn,
        checkOut: input.stay.checkOut,
        unit: input.stay.unit,
        guestCount: input.stay.guestCount ?? null,
        specialRequests: input.stay.specialRequests ?? null,
        ratePlanId: input.stay.ratePlanId ?? null,
        pmsBookingRef: input.stay.pmsBookingRef ?? null,

        status: mappedStatus,
      },
    });

    // ── booking_modified vs booking_cancelled discriminator ────────────
    //
    // Cancel trumps modify (Phase 2 Q7). When a single PMS update both
    // changes fields AND transitions status → CANCELLED, we emit
    // booking_cancelled ONLY. The cancellation is the more specific
    // signal — pre-cancellation field changes are almost always PMS
    // internal housekeeping (the PMS clearing dates / reassigning units /
    // closing balances as part of the cancel). Emitting both would
    // double-count the cancellation in Phase 5 aggregations.
    //
    // The discriminator is "is this update transitioning into CANCELLED?"
    // (mappedStatus is CANCELLED AND the row was not already cancelled).
    // A re-sync of an already-cancelled booking with no field changes
    // never reaches this branch — it falls into Case 3 (IDENTICAL).
    //
    // See docs/analytics/event-catalog.md "Relationship to other events"
    // sections under booking_modified and booking_cancelled.
    const isCancellationTransition =
      mappedStatus === "CANCELLED" && existing.status !== "CANCELLED";

    const commonPayload = {
      booking_id: existing.id,
      pms_provider: derivePMSAdapterType(input.provider) as PMSProvider,
      pms_reference: input.externalId,
      check_in_date: formatAnalyticsDate(input.stay.checkIn),
      check_out_date: formatAnalyticsDate(input.stay.checkOut),
      number_of_nights: pmsBookingNights(input.stay.checkIn, input.stay.checkOut),
      number_of_guests: input.stay.guestCount ?? null,
      accommodation_id: null as string | null,
      source_channel: "pms_import" as const,
    };

    if (isCancellationTransition) {
      await emitAnalyticsEvent(tx, {
        tenantId: input.tenantId,
        eventName: "booking_cancelled",
        schemaVersion: "0.1.0",
        occurredAt: input.providerUpdatedAt,
        actor: { actor_type: "system", actor_id: null },
        payload: { ...commonPayload, cancelled_at: input.providerUpdatedAt },
        idempotencyKey: `booking_cancelled:${existing.id}:${input.providerUpdatedAt.getTime()}`,
      });
    } else {
      await emitAnalyticsEvent(tx, {
        tenantId: input.tenantId,
        eventName: "booking_modified",
        schemaVersion: "0.1.0",
        occurredAt: input.providerUpdatedAt,
        actor: { actor_type: "system", actor_id: null },
        payload: {
          ...commonPayload,
          provider_updated_at: input.providerUpdatedAt,
        },
        idempotencyKey: `booking_modified:${existing.id}:${input.providerUpdatedAt.getTime()}`,
      });
    }

    return {
      action: "updated" satisfies UpsertAction,
      bookingId: existing.id,
      tenantId: input.tenantId,
      externalId: input.externalId,
    };
  });
}

// ── Helpers used by Case 1 + Case 4 analytics emits ──────────────────────

function pmsBookingNights(checkIn: Date, checkOut: Date): number {
  return Math.max(
    1,
    Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

function pmsBookingGuestEmailHash(tenantId: string, email: string): string {
  // Mirrors deriveGuestId's email-only branch: the analytics layer takes
  // raw email through SHA-256 with tenant scoping so the same address
  // across tenants gets distinct pseudonyms. PMS imports start without a
  // GuestAccount link; the linked event is `guest_account_linked`.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("node:crypto");
  const normalized = email.trim().toLowerCase();
  const hex = createHash("sha256")
    .update(`${tenantId}:${normalized}`)
    .digest("hex");
  return `email_${hex.slice(0, 16)}`;
}

// ── Side-effects: audit + log (post-commit, failure-tolerant) ──

function syncEventTypeFor(
  action: UpsertAction,
  status: IngestStatus,
): "booking.created" | "booking.modified" | "booking.cancelled" | "sync.completed" {
  if (action === "created") return "booking.created";
  if (action === "updated") {
    return status === "cancelled" ? "booking.cancelled" : "booking.modified";
  }
  // stale + identical are not business events — audit them under sync.*
  return "sync.completed";
}

async function recordAudit(
  input: BookingUpsertInput,
  result: UpsertResult,
): Promise<void> {
  await logSyncEvent(
    input.tenantId,
    input.provider,
    syncEventTypeFor(result.action, input.status),
    {
      source: input.source,
      action: result.action,
      bookingId: result.bookingId,
      providerUpdatedAt: input.providerUpdatedAt.toISOString(),
      ...(input.status === "no_show" ? { noShow: true } : {}),
      ...(result.recoveryLagMs !== undefined
        ? { recoveryLagMs: result.recoveryLagMs }
        : {}),
    },
    input.externalId,
  );
}

function emitStructuredLog(
  input: BookingUpsertInput,
  result: UpsertResult,
): void {
  // The key observability signal: a `booking.created` with
  // source="reconciliation" means the webhook path missed this
  // booking. Monitoring should alert on sustained > 0 of this event
  // per (tenantId, provider).
  const event =
    result.action === "created"
      ? "pms.ingest.created"
      : result.action === "updated"
        ? "pms.ingest.updated"
        : result.action === "unchanged_stale"
          ? "pms.ingest.stale_ignored"
          : "pms.ingest.unchanged_identical";

  log("info", event, {
    tenantId: input.tenantId,
    provider: input.provider,
    source: input.source,
    externalId: input.externalId,
    bookingId: result.bookingId,
    ...(result.recoveryLagMs !== undefined
      ? { recoveryLagMs: result.recoveryLagMs }
      : {}),
  });
}

// ── Public entry point ──────────────────────────────────────

/**
 * Durably ingest one booking from a PMS into the local database.
 *
 * Safe to call concurrently with the same `externalId` — duplicate
 * calls serialize on the row lock and exactly one produces
 * action="created" or "updated"; the rest become no-ops.
 *
 * Never throws on business conditions (stale events, identical data).
 * Throws only on validation failure (Zod) or on infrastructure errors
 * that persisted after retries (DB unavailable, logic bug, etc.).
 * Callers must translate throws into their own retry/ack semantics:
 *
 *   • Webhook handler: throw → HTTP 5xx → PMS redelivers
 *   • Cron orchestrator: throw → write BookingSyncError row, continue
 */
export async function upsertBookingFromPms(
  rawInput: BookingUpsertInput,
): Promise<UpsertResult> {
  // ── 1. Validate input at the boundary ──
  // Every path in must satisfy the same contract. Invalid input is a
  // programmer error, not a data error — throw loudly.
  const input = BookingUpsertInputSchema.parse(rawInput);

  // ── 2. Tag the observability context before any DB work ──
  // Any Sentry capture triggered by a throw inside the tx will be
  // correctly attributed to the tenant that caused it.
  setSentryTenantContext(input.tenantId);

  // ── 3. Attempt the transactional upsert with bounded retry ──
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await executeUpsertOnce(input);

      // ── 4. Side-effects, post-commit, non-blocking ──
      // logSyncEvent swallows its own errors. We still wrap the whole
      // side-effect block defensively so a bug in our log payload
      // assembly can never leak back and fail an already-durable write.
      try {
        await recordAudit(input, result);
      } catch (e) {
        log("warn", "pms.ingest.audit_failed", {
          tenantId: input.tenantId,
          externalId: input.externalId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      emitStructuredLog(input, result);

      return result;
    } catch (err) {
      lastError = err;

      if (!isRetryable(err) || attempt === MAX_ATTEMPTS) {
        log("error", "pms.ingest.failed", {
          tenantId: input.tenantId,
          provider: input.provider,
          source: input.source,
          externalId: input.externalId,
          attempt,
          error: err instanceof Error ? err.message : String(err),
          code:
            err instanceof Prisma.PrismaClientKnownRequestError
              ? err.code
              : undefined,
        });
        throw err;
      }

      log("warn", "pms.ingest.retrying", {
        tenantId: input.tenantId,
        externalId: input.externalId,
        attempt,
        code:
          err instanceof Prisma.PrismaClientKnownRequestError
            ? err.code
            : undefined,
      });

      await sleepJittered(BASE_BACKOFF_MS * Math.pow(3, attempt - 1));
    }
  }

  // Loop exits only via return or throw above; this is unreachable but
  // keeps the type checker happy and makes the invariant explicit.
  throw lastError ?? new Error("pms.ingest: retry loop exited without result");
}
