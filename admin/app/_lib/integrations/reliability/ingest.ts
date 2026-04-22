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

    return {
      action: "updated" satisfies UpsertAction,
      bookingId: existing.id,
      tenantId: input.tenantId,
      externalId: input.externalId,
    };
  });
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
