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
 * Operational ↔ analytics field mapping:
 *   page_type           ← classified at emit time by the worker:
 *                         "home" | "stay" | "checkout" | "account"
 *                         | "support" | "policy" | "other".
 *                         Worker derives from URL pattern; route
 *                         changes that introduce new page types
 *                         require a v0.2.0 schema bump.
 *   storefront_context  ← shared StorefrontContextSchema fields
 *                         (page_url, page_referrer, user_agent_hash,
 *                          viewport, locale, session_id)
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
