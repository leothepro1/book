/**
 * Validator parity — Zod schema vs hand-rolled `.validator.ts`.
 *
 * The Web Worker bundles the hand-rolled validators (cannot afford
 * Zod's 30+ KB gzipped overhead — see `<event>.validator.ts` headers
 * for context). The server bundles Zod schemas. Both must agree on
 * `ok` outcome for every payload, or storefront-emitted events that
 * pass worker-side will fail server-side (or vice versa) and we
 * silently leak data, drop events, or both.
 *
 * This file is the mechanical drift guard. For every storefront event
 * we maintain a corpus of (label, payload, ok) fixtures that exercise:
 *   - canonical valid payload
 *   - missing required field per field
 *   - wrong type per field
 *   - boundary values (empty string, zero, negative, oversize)
 *
 * Each fixture runs through BOTH validators. If the two disagree on
 * `ok` (one passes, the other fails) the test fails with a clear
 * message naming the event + fixture + which side disagreed.
 *
 * Both versions covered: when an event has multiple live versions
 * (e.g. cart_started v0.1.0 deprecated + v0.2.0 current during the
 * outbox drain window), we maintain a parity case for each version.
 *
 * If you add a storefront event:
 *   1. Create `<event>.ts` (Zod) and `<event>.validator.ts` (hand-rolled).
 *   2. Add an entry to PARITY_CASES below with at least 6 fixtures
 *      (canonical valid + 5 invalid — one per required field).
 *   3. Run this test. CI blocks merge if it fails.
 *
 * If you change a field's validation rule on either side, the parity
 * test will fail until you mirror the change on the other side. That
 * is the point.
 */

import { describe, expect, it } from "vitest";

import { AccommodationViewedPayloadSchema } from "./accommodation-viewed";
import { validateAccommodationViewedPayload } from "./accommodation-viewed.validator";
import { AvailabilitySearchedPayloadSchema } from "./availability-searched";
import { validateAvailabilitySearchedPayload } from "./availability-searched.validator";
import { CartAbandonedPayloadSchema } from "./cart-abandoned";
import { validateCartAbandonedPayload } from "./cart-abandoned.validator";
import { CartStartedPayloadSchema } from "./cart-started";
import { validateCartStartedPayload } from "./cart-started.validator";
import { CartUpdatedPayloadSchema } from "./cart-updated";
import { validateCartUpdatedPayload } from "./cart-updated.validator";
import { CheckoutStartedPayloadSchema } from "./checkout-started";
import { validateCheckoutStartedPayload } from "./checkout-started.validator";
import { PageViewedPayloadSchema } from "./page-viewed";
import { validatePageViewedPayload } from "./page-viewed.validator";

// ── Legacy v0.1.0 schemas + validators (kept for outbox-drain) ──────

import { CartStartedV010PayloadSchema } from "./legacy/cart-started-v0.1.0";
import { validateCartStartedV010Payload } from "./legacy/cart-started-v0.1.0.validator";
import { CartUpdatedV010PayloadSchema } from "./legacy/cart-updated-v0.1.0";
import { validateCartUpdatedV010Payload } from "./legacy/cart-updated-v0.1.0.validator";
import { CartAbandonedV010PayloadSchema } from "./legacy/cart-abandoned-v0.1.0";
import { validateCartAbandonedV010Payload } from "./legacy/cart-abandoned-v0.1.0.validator";
import { CheckoutStartedV010PayloadSchema } from "./legacy/checkout-started-v0.1.0";
import { validateCheckoutStartedV010Payload } from "./legacy/checkout-started-v0.1.0.validator";

// ── Canonical context (re-used across event fixtures) ───────────────

const CTX = {
  page_url: "https://apelviken.rutgr.com/stay/svalan",
  page_referrer: "https://apelviken.rutgr.com/",
  user_agent_hash: "ua_a3f7b2c1d4e5f6a7",
  viewport: { width: 1440, height: 900 },
  locale: "sv-SE",
  session_id: "01HZ8WF7Z7Z7Z7Z7Z7Z7Z7Z7ZB",
};

// ── Per-event fixture corpus ────────────────────────────────────────

interface Fixture {
  label: string;
  payload: unknown;
  ok: boolean;
}

interface ParityCase {
  event: string;
  zod: { safeParse: (v: unknown) => { success: boolean } };
  hand: (v: unknown) => { ok: boolean };
  fixtures: Fixture[];
}

const CART_TOTAL_VALID = { amount: 12900, currency: "SEK" };

const PARITY_CASES: ParityCase[] = [
  {
    event: "page_viewed",
    zod: PageViewedPayloadSchema,
    hand: validatePageViewedPayload,
    fixtures: [
      { label: "valid: stay", payload: { ...CTX, page_type: "stay" }, ok: true },
      { label: "valid: home", payload: { ...CTX, page_type: "home" }, ok: true },
      { label: "valid: other", payload: { ...CTX, page_type: "other" }, ok: true },
      { label: "invalid: page_type out of enum", payload: { ...CTX, page_type: "unknown" }, ok: false },
      { label: "invalid: page_type missing", payload: { ...CTX }, ok: false },
      { label: "invalid: page_url empty", payload: { ...CTX, page_url: "", page_type: "stay" }, ok: false },
      { label: "invalid: viewport.width negative", payload: { ...CTX, viewport: { width: -1, height: 900 }, page_type: "stay" }, ok: false },
      { label: "invalid: locale too short", payload: { ...CTX, locale: "s", page_type: "stay" }, ok: false },
      { label: "invalid: empty object", payload: {}, ok: false },
      { label: "invalid: null payload", payload: null, ok: false },
    ],
  },
  {
    event: "accommodation_viewed",
    zod: AccommodationViewedPayloadSchema,
    hand: validateAccommodationViewedPayload,
    fixtures: [
      { label: "valid: cabin", payload: { ...CTX, accommodation_id: "acc_x", accommodation_type: "cabin" }, ok: true },
      { label: "valid: hotel", payload: { ...CTX, accommodation_id: "acc_x", accommodation_type: "hotel" }, ok: true },
      { label: "invalid: accommodation_id empty", payload: { ...CTX, accommodation_id: "", accommodation_type: "cabin" }, ok: false },
      { label: "invalid: accommodation_type out of enum", payload: { ...CTX, accommodation_id: "acc_x", accommodation_type: "yurt" }, ok: false },
      { label: "invalid: accommodation_type missing", payload: { ...CTX, accommodation_id: "acc_x" }, ok: false },
      { label: "invalid: empty object", payload: {}, ok: false },
    ],
  },
  {
    event: "availability_searched",
    zod: AvailabilitySearchedPayloadSchema,
    hand: validateAvailabilitySearchedPayload,
    fixtures: [
      {
        label: "valid: full search",
        payload: {
          ...CTX,
          check_in_date: "2026-06-01",
          check_out_date: "2026-06-04",
          number_of_guests: 2,
          results_count: 5,
          filters_applied: ["facility:wifi", "category:cmcb12abc"],
        },
        ok: true,
      },
      {
        label: "valid: zero results",
        payload: {
          ...CTX,
          check_in_date: "2026-06-01",
          check_out_date: "2026-06-04",
          number_of_guests: 1,
          results_count: 0,
          filters_applied: [],
        },
        ok: true,
      },
      {
        label: "invalid: check_in_date wrong format",
        payload: {
          ...CTX,
          check_in_date: "2026/06/01",
          check_out_date: "2026-06-04",
          number_of_guests: 2,
          results_count: 5,
          filters_applied: [],
        },
        ok: false,
      },
      {
        label: "invalid: number_of_guests zero (must be positive)",
        payload: {
          ...CTX,
          check_in_date: "2026-06-01",
          check_out_date: "2026-06-04",
          number_of_guests: 0,
          results_count: 5,
          filters_applied: [],
        },
        ok: false,
      },
      {
        label: "invalid: results_count negative",
        payload: {
          ...CTX,
          check_in_date: "2026-06-01",
          check_out_date: "2026-06-04",
          number_of_guests: 2,
          results_count: -1,
          filters_applied: [],
        },
        ok: false,
      },
      {
        label: "invalid: filters_applied has empty string",
        payload: {
          ...CTX,
          check_in_date: "2026-06-01",
          check_out_date: "2026-06-04",
          number_of_guests: 2,
          results_count: 5,
          filters_applied: ["facility:wifi", ""],
        },
        ok: false,
      },
    ],
  },

  // ── cart_started v0.2.0 (current) ─────────────────────────────────
  {
    event: "cart_started (v0.2.0)",
    zod: CartStartedPayloadSchema,
    hand: validateCartStartedPayload,
    fixtures: [
      {
        label: "valid: full cart",
        payload: { ...CTX, cart_id: "c_1", product_id: "p_1", cart_total: CART_TOTAL_VALID },
        ok: true,
      },
      {
        label: "invalid: cart_id empty",
        payload: { ...CTX, cart_id: "", product_id: "p_1", cart_total: CART_TOTAL_VALID },
        ok: false,
      },
      {
        label: "invalid: product_id missing",
        payload: { ...CTX, cart_id: "c_1", cart_total: CART_TOTAL_VALID },
        ok: false,
      },
      {
        label: "invalid: v0.1.0 shape (accommodation_id instead of product_id)",
        payload: { ...CTX, cart_id: "c_1", accommodation_id: "a_1", cart_total: CART_TOTAL_VALID },
        ok: false,
      },
      {
        label: "invalid: currency wrong length",
        payload: { ...CTX, cart_id: "c_1", product_id: "p_1", cart_total: { amount: 100, currency: "SE" } },
        ok: false,
      },
      {
        label: "invalid: amount float",
        payload: { ...CTX, cart_id: "c_1", product_id: "p_1", cart_total: { amount: 100.5, currency: "SEK" } },
        ok: false,
      },
      {
        label: "invalid: cart_total missing",
        payload: { ...CTX, cart_id: "c_1", product_id: "p_1" },
        ok: false,
      },
    ],
  },

  // ── cart_started v0.1.0 (deprecated, outbox-drain compat) ────────
  {
    event: "cart_started (v0.1.0 legacy)",
    zod: CartStartedV010PayloadSchema,
    hand: validateCartStartedV010Payload,
    fixtures: [
      {
        label: "valid: full cart",
        payload: { ...CTX, cart_id: "c_1", accommodation_id: "a_1", cart_total: CART_TOTAL_VALID },
        ok: true,
      },
      {
        label: "invalid: accommodation_id missing",
        payload: { ...CTX, cart_id: "c_1", cart_total: CART_TOTAL_VALID },
        ok: false,
      },
      {
        label: "invalid: v0.2.0 shape (product_id instead of accommodation_id)",
        payload: { ...CTX, cart_id: "c_1", product_id: "p_1", cart_total: CART_TOTAL_VALID },
        ok: false,
      },
    ],
  },

  // ── cart_updated v0.2.0 (current) ─────────────────────────────────
  {
    event: "cart_updated (v0.2.0)",
    zod: CartUpdatedPayloadSchema,
    hand: validateCartUpdatedPayload,
    fixtures: [
      {
        label: "valid: added",
        payload: { ...CTX, cart_id: "c_1", items_count: 2, line_items_count: 1, cart_total: CART_TOTAL_VALID, action: "added" },
        ok: true,
      },
      {
        label: "valid: quantity_changed",
        payload: { ...CTX, cart_id: "c_1", items_count: 3, line_items_count: 2, cart_total: CART_TOTAL_VALID, action: "quantity_changed" },
        ok: true,
      },
      {
        label: "invalid: action out of enum",
        payload: { ...CTX, cart_id: "c_1", items_count: 1, line_items_count: 1, cart_total: CART_TOTAL_VALID, action: "moved" },
        ok: false,
      },
      {
        label: "invalid: items_count zero (v0.2.0 tightened to positive)",
        payload: { ...CTX, cart_id: "c_1", items_count: 0, line_items_count: 0, cart_total: CART_TOTAL_VALID, action: "removed" },
        ok: false,
      },
      {
        label: "invalid: items_count negative",
        payload: { ...CTX, cart_id: "c_1", items_count: -1, line_items_count: 1, cart_total: CART_TOTAL_VALID, action: "added" },
        ok: false,
      },
      {
        label: "invalid: line_items_count missing",
        payload: { ...CTX, cart_id: "c_1", items_count: 2, cart_total: CART_TOTAL_VALID, action: "added" },
        ok: false,
      },
      {
        label: "invalid: items_count missing",
        payload: { ...CTX, cart_id: "c_1", line_items_count: 1, cart_total: CART_TOTAL_VALID, action: "added" },
        ok: false,
      },
    ],
  },

  // ── cart_updated v0.1.0 (deprecated, outbox-drain compat) ────────
  {
    event: "cart_updated (v0.1.0 legacy)",
    zod: CartUpdatedV010PayloadSchema,
    hand: validateCartUpdatedV010Payload,
    fixtures: [
      {
        label: "valid: added",
        payload: { ...CTX, cart_id: "c_1", items_count: 2, cart_total: CART_TOTAL_VALID, action: "added" },
        ok: true,
      },
      {
        label: "valid: zero items (post-removal — allowed in v0.1.0)",
        payload: { ...CTX, cart_id: "c_1", items_count: 0, cart_total: { amount: 0, currency: "SEK" }, action: "removed" },
        ok: true,
      },
      {
        label: "invalid: action out of enum",
        payload: { ...CTX, cart_id: "c_1", items_count: 1, cart_total: CART_TOTAL_VALID, action: "moved" },
        ok: false,
      },
    ],
  },

  // ── cart_abandoned v0.2.0 (current) ───────────────────────────────
  {
    event: "cart_abandoned (v0.2.0)",
    zod: CartAbandonedPayloadSchema,
    hand: validateCartAbandonedPayload,
    fixtures: [
      {
        label: "valid: abandoned cart",
        payload: { ...CTX, cart_id: "c_1", items_count: 2, line_items_count: 1, cart_total: CART_TOTAL_VALID, time_since_last_interaction_ms: 90_000 },
        ok: true,
      },
      {
        label: "invalid: items_count zero (must be positive)",
        payload: { ...CTX, cart_id: "c_1", items_count: 0, line_items_count: 0, cart_total: CART_TOTAL_VALID, time_since_last_interaction_ms: 90_000 },
        ok: false,
      },
      {
        label: "invalid: line_items_count missing",
        payload: { ...CTX, cart_id: "c_1", items_count: 2, cart_total: CART_TOTAL_VALID, time_since_last_interaction_ms: 90_000 },
        ok: false,
      },
      {
        label: "invalid: time_since_last_interaction_ms negative",
        payload: { ...CTX, cart_id: "c_1", items_count: 1, line_items_count: 1, cart_total: CART_TOTAL_VALID, time_since_last_interaction_ms: -1 },
        ok: false,
      },
      {
        label: "invalid: cart_id missing",
        payload: { ...CTX, items_count: 2, line_items_count: 1, cart_total: CART_TOTAL_VALID, time_since_last_interaction_ms: 1000 },
        ok: false,
      },
    ],
  },

  // ── cart_abandoned v0.1.0 (deprecated, outbox-drain compat) ──────
  {
    event: "cart_abandoned (v0.1.0 legacy)",
    zod: CartAbandonedV010PayloadSchema,
    hand: validateCartAbandonedV010Payload,
    fixtures: [
      {
        label: "valid: abandoned cart (no line_items_count required)",
        payload: { ...CTX, cart_id: "c_1", items_count: 2, cart_total: CART_TOTAL_VALID, time_since_last_interaction_ms: 90_000 },
        ok: true,
      },
      {
        label: "invalid: items_count zero",
        payload: { ...CTX, cart_id: "c_1", items_count: 0, cart_total: CART_TOTAL_VALID, time_since_last_interaction_ms: 1000 },
        ok: false,
      },
    ],
  },

  // ── checkout_started v0.2.0 (current) ─────────────────────────────
  {
    event: "checkout_started (v0.2.0)",
    zod: CheckoutStartedPayloadSchema,
    hand: validateCheckoutStartedPayload,
    fixtures: [
      {
        label: "valid: standard checkout",
        payload: { ...CTX, cart_id: "c_1", items_count: 2, line_items_count: 1, cart_total: CART_TOTAL_VALID },
        ok: true,
      },
      {
        label: "invalid: items_count zero (must be positive)",
        payload: { ...CTX, cart_id: "c_1", items_count: 0, line_items_count: 0, cart_total: CART_TOTAL_VALID },
        ok: false,
      },
      {
        label: "invalid: line_items_count missing",
        payload: { ...CTX, cart_id: "c_1", items_count: 1, cart_total: CART_TOTAL_VALID },
        ok: false,
      },
      {
        label: "invalid: cart_id missing",
        payload: { ...CTX, items_count: 1, line_items_count: 1, cart_total: CART_TOTAL_VALID },
        ok: false,
      },
      {
        label: "invalid: cart_total missing",
        payload: { ...CTX, cart_id: "c_1", items_count: 1, line_items_count: 1 },
        ok: false,
      },
    ],
  },

  // ── checkout_started v0.1.0 (deprecated, outbox-drain compat) ────
  {
    event: "checkout_started (v0.1.0 legacy)",
    zod: CheckoutStartedV010PayloadSchema,
    hand: validateCheckoutStartedV010Payload,
    fixtures: [
      {
        label: "valid: standard checkout (no line_items_count required)",
        payload: { ...CTX, cart_id: "c_1", items_count: 2, cart_total: CART_TOTAL_VALID },
        ok: true,
      },
      {
        label: "invalid: items_count zero",
        payload: { ...CTX, cart_id: "c_1", items_count: 0, cart_total: CART_TOTAL_VALID },
        ok: false,
      },
    ],
  },
];

// ── Parity assertions ───────────────────────────────────────────────

describe("validator parity — Zod schemas vs hand-rolled validators", () => {
  for (const c of PARITY_CASES) {
    describe(c.event, () => {
      for (const f of c.fixtures) {
        it(`agrees on '${f.label}'`, () => {
          const zodOk = c.zod.safeParse(f.payload).success;
          const handOk = c.hand(f.payload).ok;
          // If they disagree, fail with a precise diagnostic.
          if (zodOk !== handOk) {
            throw new Error(
              `parity drift: ${c.event} '${f.label}' — zod.ok=${zodOk}, hand.ok=${handOk}, expected ${f.ok}`,
            );
          }
          expect(zodOk).toBe(f.ok);
          expect(handOk).toBe(f.ok);
        });
      }
    });
  }

  it("every storefront schema file has a paired .validator.ts", async () => {
    // Static structural check using filesystem listing — catches a new
    // schema file added without its paired validator. Mirrored by the
    // verify-phase3.ts check (defense in depth).
    const fs = await import("node:fs");
    const path = await import("node:path");
    const here = path.dirname(new URL(import.meta.url).pathname);
    const files = fs.readdirSync(here);
    const STOREFRONT_BASES = [
      "page-viewed",
      "accommodation-viewed",
      "availability-searched",
      "cart-started",
      "cart-updated",
      "cart-abandoned",
      "checkout-started",
    ];
    for (const base of STOREFRONT_BASES) {
      expect(files, `missing ${base}.ts`).toContain(`${base}.ts`);
      expect(files, `missing ${base}.validator.ts`).toContain(
        `${base}.validator.ts`,
      );
    }
  });

  it("every legacy v0.1.0 schema file has a paired .validator.ts", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const here = path.dirname(new URL(import.meta.url).pathname);
    const legacyDir = path.join(here, "legacy");
    const files = fs.readdirSync(legacyDir);
    const LEGACY_BASES = [
      "cart-started-v0.1.0",
      "cart-updated-v0.1.0",
      "cart-abandoned-v0.1.0",
      "checkout-started-v0.1.0",
    ];
    for (const base of LEGACY_BASES) {
      expect(files, `missing legacy/${base}.ts`).toContain(`${base}.ts`);
      expect(files, `missing legacy/${base}.validator.ts`).toContain(
        `${base}.validator.ts`,
      );
    }
  });
});
