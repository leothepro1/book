/**
 * Shared storefront-context payload fragment (Phase 3).
 *
 * Every storefront-emitted event (page_viewed, accommodation_viewed, the
 * cart_* events, checkout_started, availability_searched) carries the
 * same browser/session context. Defined once here and intersected into
 * each per-event payload schema to avoid duplication and keep the
 * shape consistent across events.
 *
 * Privacy notes:
 *   - `user_agent_hash` is sha256(navigator.userAgent).slice(0, 16).
 *     The raw UA string never enters the analytics pipeline. Phase 5
 *     can use it as a stability key (same browser → same hash) without
 *     re-fingerprinting.
 *   - `session_id` is a client-generated ULID that persists in
 *     sessionStorage for the duration of a browser tab session. It
 *     does NOT correlate with the operational `MagicLinkToken.token`
 *     or any auth cookie — it's a tracking-session id only.
 *   - `page_referrer` is whatever `document.referrer` returns. Empty
 *     string → direct visit / no referrer.
 *   - `locale` is BCP 47 (`sv`, `en`, `sv-SE`). Read from the URL or
 *     `navigator.language` at emit time.
 */

import { z } from "zod";

export const StorefrontContextSchema = z.object({
  page_url: z.string().min(1),
  page_referrer: z.string(),
  user_agent_hash: z.string().min(1),
  viewport: z.object({
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
  }),
  locale: z.string().min(2),
  session_id: z.string().min(1),
});

export type StorefrontContext = z.infer<typeof StorefrontContextSchema>;
