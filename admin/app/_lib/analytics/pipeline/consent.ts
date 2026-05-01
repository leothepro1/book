/**
 * Server-side consent gate for storefront analytics events (Phase 3).
 *
 * The dispatch endpoint (`/api/analytics/collect`) validates that the
 * incoming event's consent category is enabled in the request's
 * consent cookie BEFORE passing the payload to the emitter. The same
 * categorization is mirrored client-side in the loader/worker so the
 * worker doesn't even attempt to send an event that the visitor has
 * not consented to — but we re-check on the server because:
 *
 *   1. The browser is hostile territory. A modified loader / a
 *      hand-crafted POST can claim consent that the visitor never
 *      granted; the server is the only place we can enforce the
 *      regulatory contract.
 *   2. Consent state is read from a same-origin cookie that the
 *      worker can't reach (workers have no document.cookie). The
 *      authoritative read happens on the server anyway.
 *   3. Re-checking on the server keeps the storage write site (the
 *      emitter / outbox row) consistent with the legal basis. If the
 *      check ever drifts between client and server, the SERVER is
 *      the side that gets it right.
 *
 * ── Categories ────────────────────────────────────────────────────────────
 *
 * Three categories, mirroring the cookie banner the loader will render
 * (Phase 3 PR-B Commit C):
 *
 *   essential — strictly necessary; cannot be disabled. Used for events
 *     that are operationally indispensable (e.g. error reporting,
 *     fraud signals). NO storefront event is `essential` today —
 *     storefront events are guest-observed behaviour, not platform
 *     plumbing. The category exists so future server-emitted events
 *     that need to bypass consent (e.g. payment_failed for fraud
 *     analysis) have a documented home.
 *
 *   analytics — funnel + behavioural events. All seven Phase 3
 *     storefront events live here: page_viewed, accommodation_viewed,
 *     availability_searched, cart_started, cart_updated,
 *     cart_abandoned, checkout_started.
 *
 *   marketing — ad attribution, retargeting, conversion uploads to
 *     ad platforms. No storefront event is in this category yet;
 *     reserved for Phase 4+ (Google Ads / Meta Ads conversion
 *     pipelines).
 *
 * ── Server-emitted events ─────────────────────────────────────────────────
 *
 * Operational events (booking_completed, payment_succeeded, etc.) are
 * NOT routed through this helper. They originate from server-side
 * mutations the platform must record regardless of guest consent (a
 * hotel cannot "opt out" of having its bookings logged). The dispatch
 * endpoint refuses any non-storefront event by name BEFORE consent is
 * even consulted; this helper's `eventCategoryFor` therefore only
 * recognizes the seven storefront events and throws on anything else.
 * That throw is a routing bug at the dispatch endpoint, not a
 * legitimate runtime case.
 */

import { z } from "zod";

// ── Schema ───────────────────────────────────────────────────────────────

/**
 * The shape of the consent state read off the request — in Phase 3 PR-B
 * this comes from a same-origin `bf_consent` cookie set by the loader's
 * banner. `essential` is fixed `true` because the user cannot disable
 * strictly-necessary events; the literal type encodes that contract.
 */
export const ConsentCategoriesSchema = z.object({
  essential: z.literal(true),
  analytics: z.boolean(),
  marketing: z.boolean(),
});

export type ConsentCategories = z.infer<typeof ConsentCategoriesSchema>;

export type ConsentCategory = keyof ConsentCategories;

// ── Errors ───────────────────────────────────────────────────────────────

export class AnalyticsConsentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsConsentError";
  }
}

export class UnknownStorefrontEventError extends AnalyticsConsentError {
  constructor(eventName: string) {
    super(
      `analytics event_name ${JSON.stringify(eventName)} is not a storefront event. ` +
        `Server-emitted events are not consent-gated and must not be routed through ` +
        `the dispatch endpoint. If this is a new storefront event, add it to ` +
        `STOREFRONT_EVENT_CATEGORIES in app/_lib/analytics/pipeline/consent.ts.`,
    );
    this.name = "UnknownStorefrontEventError";
  }
}

// ── Mapping ──────────────────────────────────────────────────────────────

/**
 * The closed set of storefront events the dispatch endpoint accepts,
 * each mapped to its consent category. Adding a new storefront event
 * requires adding an entry here AND to ANALYTICS_EVENT_REGISTRY in
 * schemas/registry.ts. The dispatch endpoint cross-references both.
 *
 * `as const satisfies` pins the keys to literal strings so the type
 * `StorefrontEventName` is exact (not `string`), and pins each value
 * to a real `ConsentCategory` so a typo here is a compile error.
 */
export const STOREFRONT_EVENT_CATEGORIES = {
  page_viewed: "analytics",
  accommodation_viewed: "analytics",
  availability_searched: "analytics",
  cart_started: "analytics",
  cart_updated: "analytics",
  cart_abandoned: "analytics",
  checkout_started: "analytics",
} as const satisfies Record<string, ConsentCategory>;

export type StorefrontEventName = keyof typeof STOREFRONT_EVENT_CATEGORIES;

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Returns the consent category for a storefront event name. Throws
 * `UnknownStorefrontEventError` if the event isn't a storefront event
 * — that's a dispatch-routing bug, not a legitimate runtime case.
 */
export function eventCategoryFor(eventName: string): ConsentCategory {
  const category = (STOREFRONT_EVENT_CATEGORIES as Record<string, ConsentCategory>)[eventName];
  if (!category) {
    throw new UnknownStorefrontEventError(eventName);
  }
  return category;
}

/**
 * Returns true if the visitor has granted consent for the category that
 * `eventName` belongs to. Server callers (the dispatch endpoint) must
 * only invoke this AFTER `ConsentCategoriesSchema.parse(...)` has
 * validated the consent input — passing an unknown shape here is a
 * type error.
 *
 * `essential` always returns true (literal `true` in the schema). The
 * branch is kept for completeness so future server-emitted events that
 * route through this helper read uniformly.
 */
export function isEventConsented(
  eventName: string,
  consent: ConsentCategories,
): boolean {
  const category = eventCategoryFor(eventName);
  return consent[category] === true;
}

/**
 * Convenience: parses a raw consent value (e.g. JSON.parse of the
 * cookie body) and returns the typed object. Throws on invalid shape;
 * the dispatch endpoint translates that into a 400 response. Kept here
 * (rather than at the call site) so all consent-input handling is
 * funnelled through one parser and stays consistent across routes.
 */
export function parseConsentCategories(input: unknown): ConsentCategories {
  return ConsentCategoriesSchema.parse(input);
}
