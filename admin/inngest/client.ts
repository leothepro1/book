/**
 * Inngest client — single instance for the whole app.
 *
 * Strict event typing: every event Inngest carries must appear in the
 * `InngestEvents` map below. Application code calls `sendInngest` (the
 * thin typed wrapper around `inngest.send`) so a typo or a missing
 * field is a compile error rather than a runtime surprise. Phase 1A
 * registers only `analytics.outbox.flush`; later phases extend the map
 * with campaign automation, PMS sync, email retry, etc.
 *
 * Inngest v4's `send` itself is generic-but-loose — a typed wrapper is
 * the supported pattern for v4 (the `EventSchemas`/`fromRecord` builder
 * from v3 was removed). The `inngest` instance is still exported for
 * places that need the raw client (function definitions in Phase 1B+).
 *
 * The `id` is the Inngest "app id" — surfaces in the Inngest dashboard
 * and is the deduplication key Vercel's Inngest integration uses when
 * syncing functions on each deploy. Keep it stable across phases.
 */

import { Inngest } from "inngest";

export type InngestEvents = {
  /**
   * Fire-and-forget signal to wake the analytics outbox drainer.
   * Emitted after a successful operational transaction commits a row to
   * `analytics.outbox`. The drainer (Phase 1B) reads the outbox itself —
   * `hint_count` is metadata only, not authoritative.
   *
   * If this signal is lost (Inngest unreachable, Vercel cold start,
   * pod crash mid-emit) the drainer's cron fallback (Phase 1B) picks the
   * row up within ~60 s. Never throw on send failure.
   */
  "analytics.outbox.flush": {
    data: {
      tenant_id: string;
      hint_count?: number;
    };
  };
  /**
   * Cron-triggered scan event (Phase 1B). The scan-analytics-outbox
   * function fires this on its `* * * * *` schedule, then itself fans
   * out per-tenant `analytics.outbox.flush` events for any tenant with
   * pending outbox rows.
   *
   * Empty data — the scanner derives the per-tenant set from the DB,
   * not from the event payload. Kept as a typed event (rather than a
   * pure cron handler) so it shows up in the Inngest dashboard with
   * the same observability story as the other analytics events.
   */
  "analytics.outbox.scan": {
    data: Record<string, never>;
  };
  /**
   * Cron-triggered scan event for the Phase 5A aggregator. Mirrors
   * `analytics.outbox.scan` — exposed as a typed event so operators
   * (and verify-phase5a-aggregator.ts) can invoke an immediate scan
   * without waiting for the next 15-min cron tick.
   */
  "analytics.aggregate.scan": {
    data: Record<string, never>;
  };
  /**
   * Per-tenant fanout from the aggregator scanner. Triggers
   * `run-analytics-aggregate-day` which runs the 48h sliding window
   * for the tenant via runAggregateDay.
   */
  "analytics.aggregate.fanout": {
    data: {
      tenant_id: string;
    };
  };
};

export type InngestEventName = keyof InngestEvents;

export const inngest = new Inngest({
  id: "bedfront",
});

/**
 * Type-safe wrapper around `inngest.send`. Use this from application
 * code instead of calling `inngest.send` directly so the event name and
 * payload shape are checked at compile time against `InngestEvents`.
 */
export async function sendInngest<TName extends InngestEventName>(
  payload: { name: TName } & InngestEvents[TName],
): Promise<void> {
  await inngest.send(payload);
}
