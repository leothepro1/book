/**
 * Shared storefront-context payload fragment (Phase 3).
 *
 * Every storefront-emitted event (page_viewed, accommodation_viewed, the
 * cart_* events, checkout_started, availability_searched) carries the
 * same browser/session context. Defined once here and intersected into
 * each per-event payload schema to avoid duplication and keep the
 * shape consistent across events.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Semantic Contract
 * ──────────────────────────────────────────────────────────────────────
 *
 * Some specifications below describe TARGET behaviour that the loader
 * does not yet implement. They are documented here as the canonical
 * contract that emit-sites and Phase 5 readers may rely on. Loader
 * implementation tracking these targets is the responsibility of the
 * upcoming Loader hardening PR; until that PR lands, current loader
 * behaviour may be a strict subset of what the contract guarantees.
 * Each field below names whether its specification is current or target.
 *
 * `page_url` (target — Loader hardening PR enforces). Fully-qualified
 *   URL of the page at emit time. The loader sanitizes the query string
 *   against an allowlist before emit. Permitted query parameters:
 *
 *       utm_source, utm_medium, utm_campaign, utm_term, utm_content,
 *       fbclid, gclid
 *
 *   All other query parameters AND the URL fragment (`#hash`) are
 *   stripped. The allowlist is exhaustive — adding a new permitted
 *   parameter requires a v0.2.0 schema bump on this fragment.
 *   Phase 5 readers MAY treat `page_url` as PII-clean once the Loader
 *   hardening PR ships; pre-hardening, readers MUST treat it as
 *   untrusted.
 *
 * `page_referrer` (current). Whatever `document.referrer` returns at
 *   emit time. Empty string for direct visits. NO sanitization is
 *   performed at emit time — cross-origin referrer URLs are passed
 *   through as the browser provides them. Phase 5 readers MUST treat
 *   `page_referrer` as untrusted PII and apply their own sanitization
 *   before aggregation.
 *
 * `user_agent_hash` (target — Loader hardening PR enforces). 16-character
 *   lowercase hex string. Computed as:
 *
 *       sha256(tenantSalt || ":" || navigator.userAgent.slice(0, 200))
 *         .slice(0, 16)
 *
 *   `tenantSalt` is a per-tenant value generated once at tenant creation
 *   and stored in `Tenant.settings.analyticsSalt`. It is server-side
 *   only — the loader fetches it via the runtime manifest endpoint and
 *   never exposes the raw value to the client beyond the hashing
 *   computation. Properties of this construction:
 *
 *     • Stability within a tenant: same browser produces the same hash
 *       across page loads, sessions, and tabs.
 *     • Cross-tenant isolation: the same browser visiting two tenants
 *       produces two unrelated hashes, preventing cross-tenant stitching.
 *     • Rotation: when an operator rotates `Tenant.settings.analyticsSalt`
 *       (out-of-band action), all subsequent emits produce new hashes.
 *       Pre- and post-rotation events do NOT stitch — this is the
 *       intended behaviour for "wipe my tenant's behavioural history".
 *
 *   The raw User-Agent string never enters the analytics pipeline.
 *
 * `viewport.width`, `viewport.height` (current). Integers, CSS pixels
 *   (`window.innerWidth` / `window.innerHeight`). NOT device pixels (DPR
 *   is not multiplied in). Captured ONCE at emit time — not updated on
 *   resize within the same event. Phase 5 readers should treat viewport
 *   as a coarse signal, not a stable identifier.
 *
 * `locale` (target — Loader hardening PR enforces). BCP 47 tag, lowercase
 *   language subtag with optional uppercase region (`sv`, `en`, `sv-SE`,
 *   `en-GB`). The loader resolves the locale in this order:
 *
 *     1. Explicit `?locale=` URL query parameter (allowed by the
 *        sanitization allowlist for this purpose only).
 *     2. HTML `lang` attribute set by the server during SSR.
 *     3. `navigator.language`.
 *
 *   First match wins. Pre-hardening loader uses (3) only; emit-sites
 *   pre-hardening produce navigator-language-only values, which is
 *   structurally valid against this contract.
 *
 * `session_id` (target — Loader hardening PR enforces). ULID, scoped to
 *   a single browser tab session. Storage: `sessionStorage` (per-tab,
 *   wiped on tab close). NOT correlated with `MagicLinkToken.token` or
 *   any authentication cookie — `session_id` is a tracking-session id
 *   only. Lifecycle:
 *
 *     • Generated on the first storefront emit in a tab.
 *     • Rotated when ANY of:
 *         - 30 minutes elapse since the last storefront emit (idle), OR
 *         - The visitor revokes consent and then re-grants it (privacy
 *           reset — old session does not resume), OR
 *         - The tab is closed and reopened (sessionStorage clears).
 *     • Multi-tab: each open tab maintains its own `session_id`.
 *       Aggregators that need to correlate sessions across tabs of the
 *       same browser MUST use `user_agent_hash` plus time-window
 *       heuristics; `session_id` alone is insufficient.
 *
 * Pre-hardening loader behaviour for `session_id`: tab-scoped lifetime
 * only — idle and consent-rotation triggers are not yet implemented.
 * Emits remain valid against the schema (any ULID satisfies the
 * structural constraint).
 *
 * `visitor_id` (Phase 3.6 — loader populates; schema-optional during
 *   browser-cache drain). UUID v4, scoped to a single browser
 *   (per-tenant). Storage: `localStorage["bf_vid"]` as
 *   `{ value, createdAt }`, with a 2-year TTL enforced in JS at read
 *   time (localStorage has no native TTL). Lifecycle:
 *
 *     • Generated by the loader on the first storefront emit when no
 *       prior `bf_vid` exists.
 *     • Persists across sessions, tabs, browser restarts. The same
 *       browser produces the same visitor_id for two years.
 *     • Re-minted when `Date.now() - createdAt > 2 years` — the read
 *       path checks the timestamp on every emit and rotates if stale.
 *     • Re-minted when storage is cleared (DevTools, "Clear site
 *       data", browser-side cookie/storage purge).
 *     • Falls back to an in-memory value when localStorage throws
 *       (private browsing on some Safari versions). In that mode
 *       visitor_id is unstable across page loads — same degradation
 *       as session_id's private-mode fallback.
 *
 *   NOT correlated with `user_agent_hash`. The hash is browser-fingerprint
 *   adjacent (changes on UA upgrade); visitor_id is a stable cookie-like
 *   identity that survives UA changes.
 *
 *   NOT correlated with `guest_id` (email-based identity from Phase 1A).
 *   visitor_id stitches anonymous behaviour; guest_id stitches
 *   authenticated behaviour. Phase 5 attribution joins both.
 *
 *   Format = UUID v4 (`crypto.randomUUID()`) — chosen over ULID
 *   specifically because a 2-year persistent cookie should NOT encode
 *   creation time. ULID's first 48 bits are a millisecond timestamp;
 *   UUID v4 is uniformly random.
 *
 *   Schema is `.optional()` during the Phase 3.6 rollout window because
 *   browser-cached pre-3.6 loader bundles continue emitting the old
 *   shape until their hash references expire. Once the drain window
 *   closes, a follow-up PR tightens to required.
 *
 * `landing_page` (Phase 3.6 — loader populates; schema-optional during
 *   drain window). Sanitized URL string. The first page visited in a
 *   session — captured ONCE on the first emit of a session and kept
 *   stable for the rest of that session, regardless of subsequent
 *   navigations. Storage: `sessionStorage["bf_landing"]`. Sanitization:
 *   passes through the same `sanitizePageUrl()` as `page_url` (UTM-allowlist,
 *   fragment stripped) so UTM-bearing landing pages are preserved.
 *   Lifecycle: rotated together with `session_id` — when
 *   `clearSessionId()` fires (idle, deny→grant transition, tab close
 *   via sessionStorage semantics), `bf_landing` is also cleared, and
 *   the next emit captures a fresh landing page.
 *
 *   Required by Shopify-style last-non-direct-click attribution: lets
 *   Phase 5 readers identify which page started the session, even if
 *   the visitor navigated away before the attribution event fired.
 *
 *   Schema is `.optional()` during Phase 3.6 rollout for the same
 *   browser-cache-drain reason as `visitor_id`.
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
  // Phase 3.6 additions — optional during cache-drain window. Loader
  // always populates; tighten to required in a follow-up after older
  // browser-cached loader hashes expire.
  visitor_id: z.string().uuid().optional(),
  landing_page: z.string().min(1).optional(),
});

export type StorefrontContext = z.infer<typeof StorefrontContextSchema>;
