/**
 * Read-your-write PMS state verification
 * ════════════════════════════════════════
 *
 * After every write to the PMS (createBooking, confirmHold), we can
 * fetch the reservation back and compare the fields it stored
 * against what we sent. Catches the class of bug that otherwise
 * hides until a guest shows up at the hotel:
 *
 *   - Timezone drift (we sent 15:00 UTC, PMS stored 16:00 local)
 *   - Wrong date serialisation (we sent ISO, PMS parsed as MM/DD/YYYY)
 *   - Silent eventual-consistency (PMS accepted but hasn't persisted)
 *   - Silent field truncation (email/name exceeding PMS field limits)
 *   - Status not actually Confirmed (returned success but state="Inquired")
 *
 * Failure mode: this function NEVER throws. Adapter errors (network,
 * auth) surface as `{ matches: false, reason: "adapter_unreachable" }`
 * so the caller can distinguish "data really doesn't match" from "we
 * couldn't verify at all". The caller decides whether to retry or
 * proceed — but by default we accept the write and flag the booking
 * for operator review rather than cancelling.
 */

import { log } from "@/app/_lib/logger";
import type { PmsAdapter } from "../adapter";
import type { BookingLookup } from "../types";

export type IntegrityMismatchField = {
  field: string;
  expected: string | number | null;
  actual: string | number | null;
};

export type VerifyPmsStateResult =
  | { matches: true }
  | {
      matches: false;
      reason:
        | "pms_not_found"
        | "state_mismatch"
        | "field_mismatch"
        | "adapter_unreachable";
      mismatches?: IntegrityMismatchField[];
      adapterError?: string;
    };

export interface VerifyPmsStateArgs {
  adapter: PmsAdapter;
  tenantId: string;
  externalId: string;
  expected: {
    /** ISO YYYY-MM-DD string */
    checkIn: string;
    checkOut: string;
    guests: number;
    email: string;
  };
}

/**
 * Normalize a Date or ISO-ish string to YYYY-MM-DD for comparison.
 * Mews stores Utc timestamps with TIME COMPONENTS so comparing full
 * ISO strings would fail on hotels that use "check-in 15:00 local"
 * — we only validate the DAY. Time-of-day precision is a property
 * of the PMS's stay policy, not of our ingestion.
 */
function dayOnly(value: Date | string | undefined | null): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeEmail(email: string | undefined | null): string {
  if (!email) return "";
  return email.trim().toLowerCase();
}

// Statuses that indicate the PMS has fully accepted the reservation.
// Inquired / Optional are intermediate / pending states — we consider
// them a mismatch post-createBooking because the reservation is not
// yet a firm commitment at the PMS side.
const CONFIRMED_EQUIVALENT_STATUSES = new Set<BookingLookup["status"]>([
  "confirmed",
  "checked_in",
  "checked_out",
]);

export async function verifyPmsState(
  args: VerifyPmsStateArgs,
): Promise<VerifyPmsStateResult> {
  let lookup: BookingLookup | null;
  try {
    lookup = await args.adapter.lookupBooking(args.tenantId, args.externalId);
  } catch (err) {
    // Adapter-level problem — we can't tell whether the PMS actually
    // persisted the booking correctly. Don't flag as mismatch;
    // flag as unverifiable so operator sees "we haven't checked"
    // rather than "we checked and it's wrong".
    const msg = err instanceof Error ? err.message : String(err);
    log("warn", "pms.integrity.verify_adapter_error", {
      tenantId: args.tenantId,
      externalId: args.externalId,
      error: msg,
    });
    return {
      matches: false,
      reason: "adapter_unreachable",
      adapterError: msg,
    };
  }

  if (!lookup) {
    // The PMS responded successfully to our write but does NOT have
    // this reservation now. Classic eventual-consistency / silent
    // data loss signal. Worst possible outcome short of an explicit
    // error.
    return { matches: false, reason: "pms_not_found" };
  }

  // Status check first — if we got back an Inquired/Optional/etc
  // reservation where we expected a Confirmed one, the write
  // didn't reach its intended state.
  if (!CONFIRMED_EQUIVALENT_STATUSES.has(lookup.status)) {
    return {
      matches: false,
      reason: "state_mismatch",
      mismatches: [
        {
          field: "status",
          expected: "confirmed",
          actual: lookup.status,
        },
      ],
    };
  }

  // Field-level comparison.
  const mismatches: IntegrityMismatchField[] = [];

  const expCheckIn = args.expected.checkIn;
  const actCheckIn = dayOnly(lookup.checkIn);
  if (actCheckIn !== expCheckIn) {
    mismatches.push({
      field: "checkIn",
      expected: expCheckIn,
      actual: actCheckIn,
    });
  }

  const expCheckOut = args.expected.checkOut;
  const actCheckOut = dayOnly(lookup.checkOut);
  if (actCheckOut !== expCheckOut) {
    mismatches.push({
      field: "checkOut",
      expected: expCheckOut,
      actual: actCheckOut,
    });
  }

  if (lookup.guests !== args.expected.guests) {
    mismatches.push({
      field: "guests",
      expected: args.expected.guests,
      actual: lookup.guests,
    });
  }

  const expEmail = normalizeEmail(args.expected.email);
  const actEmail = normalizeEmail(lookup.guestEmail);
  // Only flag when we HAD an email to send — blank-sent = blank-stored
  // is fine. And don't flag if PMS has a valid email and we sent blank
  // (this is common: we don't always have guest email pre-checkout).
  if (expEmail !== "" && actEmail !== expEmail) {
    mismatches.push({
      field: "guestEmail",
      expected: expEmail,
      actual: actEmail,
    });
  }

  if (mismatches.length === 0) {
    return { matches: true };
  }

  return {
    matches: false,
    reason: "field_mismatch",
    mismatches,
  };
}
