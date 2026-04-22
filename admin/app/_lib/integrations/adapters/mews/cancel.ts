/**
 * Mews adapter — cancel reservation.
 *
 * POST /api/connector/v1/reservations/cancel
 *   ReservationIds: [externalId]
 *   PostCancellationFee: false        ← we manage fees via Stripe
 *   SendEmail: false                  ← we send via sendEmailEvent()
 *   Notes?: <engine-constructed reason + guestNote>
 *
 * Failure classification (engine contract):
 *   • 200 OK               → success, alreadyCanceled=false
 *   • 403 + already-canceled confirmed via state fetch → alreadyCanceled=true
 *   • 403 other reason (Started / Processed etc.)     → PermanentPmsError
 *   • 400, 401             → PermanentPmsError
 *   • 408, 429, 500, 503   → TransientPmsError  (retriable)
 *   • network / unknown    → TransientPmsError  (err on retry side)
 *
 * Idempotency strategy: Mews does not accept idempotency keys. On a 403
 * we do ONE extra call to reservations/getAll to disambiguate "already
 * cancelled" (idempotent success for us) from "not cancellable for
 * another reason" (genuine failure). This costs one rate-limit token
 * per error but gives us deterministic retry safety.
 */

import type { CancelBookingParams, CancelBookingResult } from "../../types";
import {
  TransientPmsError,
  PermanentPmsError,
} from "@/app/_lib/cancellations/errors";
import { MewsApiError, type MewsClient } from "./client";
import {
  MewsCancelReservationsResponseSchema,
  MewsGetReservationsResponseSchema,
  type MewsGetReservationsResponse,
} from "./mews-types";
import { log } from "@/app/_lib/logger";

/**
 * Fetch a single reservation's current state. Returns null when the
 * reservation is not found (deleted, wrong enterprise, etc.) — we can
 * only get here after a 403 on cancel, so "not found" itself is a
 * permanent failure that should propagate.
 */
async function fetchReservationState(
  client: MewsClient,
  reservationId: string,
): Promise<"Inquired" | "Requested" | "Optional" | "Confirmed" | "Started" | "Processed" | "Canceled" | null> {
  const raw = await client.post<Record<string, unknown>, MewsGetReservationsResponse>(
    "reservations/getAll/2023-06-06",
    {
      ReservationIds: [reservationId],
      Limitation: { Count: 1 },
    },
  );
  const parsed = MewsGetReservationsResponseSchema.parse(raw);
  const r = parsed.Reservations[0];
  return r ? r.State : null;
}

export async function cancelBookingViaMews(params: {
  client: MewsClient;
  tenantId: string;
  cancellation: CancelBookingParams;
}): Promise<CancelBookingResult> {
  const { client, tenantId, cancellation } = params;

  try {
    const raw = await client.post<Record<string, unknown>, Record<string, unknown>>(
      "reservations/cancel",
      {
        ReservationIds: [cancellation.bookingExternalId],
        PostCancellationFee: cancellation.chargeFee,
        SendEmail: cancellation.sendGuestEmail,
        ...(cancellation.note ? { Notes: cancellation.note.slice(0, 500) } : {}),
      },
    );

    const parsed = MewsCancelReservationsResponseSchema.parse(raw);

    log("info", "mews.reservation_canceled", {
      tenantId,
      reservationId: cancellation.bookingExternalId,
      idempotencyKey: cancellation.idempotencyKey,
      returnedCount: parsed.ReservationIds.length,
    });

    return {
      canceledAtPms: new Date(),
      alreadyCanceled: false,
      rawAuditPayload: { returnedCount: parsed.ReservationIds.length },
    };
  } catch (err) {
    if (err instanceof MewsApiError) {
      // 403 means the reservation is "not cancellable" per Mews. That
      // covers BOTH "already cancelled" (idempotent success for us)
      // AND "in a non-cancellable state such as Started/Processed"
      // (genuine failure). Disambiguate by fetching the state.
      if (err.status === 403) {
        let currentState: Awaited<ReturnType<typeof fetchReservationState>>;
        try {
          currentState = await fetchReservationState(
            client,
            cancellation.bookingExternalId,
          );
        } catch (lookupErr) {
          // If the state-check itself fails, we cannot disambiguate.
          // Treat the lookup failure as TRANSIENT — saga will retry
          // the whole cancel + disambiguation combo; idempotency is
          // preserved because a re-cancel of an already-Canceled
          // reservation re-enters this same 403 branch.
          log("warn", "mews.cancel.state_disambiguation_failed", {
            tenantId,
            reservationId: cancellation.bookingExternalId,
            cancelError: err.message,
            lookupError:
              lookupErr instanceof Error ? lookupErr.message : String(lookupErr),
          });
          throw new TransientPmsError(
            `Mews cancel 403 and state lookup failed: ${err.message}`,
            undefined,
            err,
          );
        }

        if (currentState === "Canceled") {
          log("info", "mews.reservation_already_canceled", {
            tenantId,
            reservationId: cancellation.bookingExternalId,
            idempotencyKey: cancellation.idempotencyKey,
          });
          return {
            canceledAtPms: new Date(),
            alreadyCanceled: true,
            rawAuditPayload: { reason: "already-canceled", mewsMessage: err.message },
          };
        }

        // Not cancellable AND not in Canceled state → genuinely permanent.
        log("warn", "mews.reservation_not_cancellable", {
          tenantId,
          reservationId: cancellation.bookingExternalId,
          currentState,
          mewsMessage: err.message,
        });
        throw new PermanentPmsError(
          `Mews refused cancel: reservation is ${currentState ?? "unknown"} — ${err.message}`,
          err,
        );
      }

      // Other Mews status codes: classify by retriable flag.
      if (err.retriable) {
        throw new TransientPmsError(
          `Mews cancel transient (${err.status}): ${err.message}`,
          undefined,
          err,
        );
      }
      throw new PermanentPmsError(
        `Mews cancel permanent (${err.status}): ${err.message}`,
        err,
      );
    }

    // Unknown error — classify as transient (err on retry side).
    throw new TransientPmsError(
      err instanceof Error ? err.message : String(err),
      undefined,
      err,
    );
  }
}
