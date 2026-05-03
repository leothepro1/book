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
 * `device_type` (target — Loader hardening PR-X2 enforces). Coarse
 *   classification of the visitor's device. Hand-rolled regex on
 *   `navigator.userAgent` in the loader (NEVER reaches the worker raw —
 *   loader-side computation only). Buckets:
 *
 *       desktop  — anything not matching mobile/tablet patterns
 *       mobile   — UA contains "iPhone" OR "Android" + "Mobile" OR
 *                  "Mobile" generic marker
 *       tablet   — UA contains "iPad" OR "Android" without "Mobile"
 *                  marker, OR navigator.maxTouchPoints > 1 on
 *                  MacIntel-platform (iPadOS 13+ desktop-mode)
 *       unknown  — UA absent / empty (SSR, headless without UA)
 *
 *   Pre-X2 emits emit absent (this field is OPTIONAL on the fragment;
 *   pre-deploy outbox rows + post-deploy SSR-only emits validate
 *   without it). Phase 5 aggregators map absence to the "unknown"
 *   bucket so dimension-coverage stays consistent. Post-X2 emits
 *   ALWAYS include the field — the loader-side classifier never
 *   throws (empty UA → "unknown").
 *
 * `visitor_id` (target — Loader hardening PR-X2 enforces). ULID
 *   generated by the loader on first emit and persisted in
 *   `localStorage` (`bf_visitor_id`). Lifecycle is BROADER than
 *   `session_id`:
 *
 *     • Survives tab close, browser restart, idle rotation, and
 *       consent re-grant (within the same browser+origin pair where
 *       localStorage persists).
 *     • Generated lazily on the first emit; once written it is
 *       NEVER rotated programmatically by the loader.
 *     • Bryts ENDAST av: localStorage clear, incognito/private
 *       browsing (where localStorage is session-scoped), or
 *       browser-data-purge — all of which constitute a "new visitor"
 *       by Bedfront-and-industry convention.
 *     • Multi-tab: shared via localStorage. All tabs of the same
 *       browser+origin see the SAME visitor_id (in contrast to
 *       session_id which is per-tab).
 *     • Cross-tenant isolation: each tenant has its own subdomain;
 *       localStorage is origin-scoped; visitor_id never crosses
 *       tenants. Same browser visiting two tenants → two distinct
 *       visitor_ids.
 *     • Consent: the loader writes/reads visitor_id ONLY when
 *       `consent.analytics === true`. Without consent the field is
 *       omitted from the emit (the schema's optional shape tolerates
 *       absence).
 *
 *   Pre-X2 emits omit the field. Post-X2 emits include it whenever
 *   consent is granted AND localStorage is writable.
 *
 * Versioning. The two fields above are PATCH-additive — both are
 * `optional`, no version bump on the fragment, no cascading event-
 * bump on the 7 storefront events. Per `schemas/registry.ts:17-20`
 * versioning policy: PATCH for additive optional fields. Strict-mode
 * enforcement (required) is deferred to a future 1.0.0-stable bump
 * at Apelviken go-live, at which point pre-deploy outbox rows will
 * have drained and the loader is the only emit-source (so absence
 * is a real bug worth surfacing as a 500).
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
  device_type: z.enum(["desktop", "mobile", "tablet", "unknown"]).optional(),
  visitor_id: z.string().min(1).optional(),
});

export type StorefrontContext = z.infer<typeof StorefrontContextSchema>;
