/**
 * page_viewed v0.1.0 (storefront)
 * ───────────────────────────────
 *
 * Fires on every page load and on SPA navigations within the guest
 * portal. The bedrock storefront event — most Phase 5 funnel
 * aggregations join against page_viewed for the denominator.
 *
 * Triggered by: the analytics web worker (Phase 3 PR-B), via the loader
 * subscribing to the portal's history-change events. Server-side
 * dispatch endpoint (`/api/analytics/collect`) validates and emits
 * to outbox using emitAnalyticsEventStandalone with the client-supplied
 * event_id.
 *
 * Idempotency: client generates a ULID per page view (in worker
 * sessionStorage) and the dispatch endpoint passes it through as the
 * outbox `event_id`. Re-dispatch (network retry, beacon double-fire)
 * dedupes at outbox `UNIQUE (tenant_id, event_id)`.
 *
 * Consent category: `analytics`.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Semantic Contract
 * ──────────────────────────────────────────────────────────────────────
 *
 * `page_type`. Closed enum with exactly seven values:
 *
 *     "home"      | "stay"   | "checkout" | "account"
 *     "support"   | "policy" | "other"
 *
 *   Classified at emit time by the loader from `window.location.pathname`.
 *   The fallback rule for any path that does not match a known prefix
 *   is `"other"` — emit-sites MUST classify every page; there is no
 *   null/empty option.
 *
 *   API routes (`/api/*`) NEVER produce `page_viewed` events. The worker
 *   bootstrap excludes them by route classification before any emit.
 *
 *   Adding a new `page_type` value (introducing a new section of the
 *   storefront) requires a v0.2.0 schema bump. Phase 5 readers MUST
 *   tolerate unknown values during migration windows by bucketing them
 *   into `"other"` until the reader is upgraded — discarding events with
 *   unknown values is NOT acceptable behaviour.
 *
 * `storefront_context`. Shared StorefrontContextSchema fields
 *   (`page_url`, `page_referrer`, `user_agent_hash`, `viewport`,
 *   `locale`, `session_id`). See `_storefront-context.ts` for the
 *   semantic contract on each field.
 */

import { z } from "zod";

import { BaseEventSchema } from "./base";
import { StorefrontContextSchema } from "./_storefront-context";

export const PageViewedPayloadSchema = StorefrontContextSchema.and(
  z.object({
    page_type: z.enum(["home", "stay", "checkout", "account", "support", "policy", "other"]),
  }),
);

export const PageViewedSchema = BaseEventSchema.and(
  z.object({
    event_name: z.literal("page_viewed"),
    schema_version: z.literal("0.1.0"),
    payload: PageViewedPayloadSchema,
  }),
);

export type PageViewedPayload = z.infer<typeof PageViewedPayloadSchema>;
export type PageViewedEvent = z.infer<typeof PageViewedSchema>;
