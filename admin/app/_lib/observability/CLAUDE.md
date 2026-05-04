# Enterprise infrastructure

This platform is built to Shopify-level enterprise standards. Every architectural
decision is made against one question: "Would Shopify approve this?" Not "does it
work?" — but "would Shopify's SRE team approve this pattern?"

The following infrastructure layers are non-negotiable. Every new feature must
integrate with them correctly or not ship.

This file covers Sentry, DB pool, Redis, ratelimit, resilientFetch, email retry,
caching, indexes, and structured logging — all infrastructure shared across the
codebase. It is loaded automatically when Claude works in
`app/_lib/observability/`, `app/_lib/db/`, `app/_lib/redis/`,
`app/_lib/rate-limit/`, or `app/_lib/http/`.

---

## Observability — Sentry

Sentry is wired up for full production error tracking.

Key files:
- sentry.client.config.ts
- sentry.server.config.ts
- sentry.edge.config.ts
- instrumentation.ts
- app/_lib/observability/sentry.ts — setSentryTenantContext()

**Rule: tenantId context on every request.**
Both tenant resolution functions call setSentryTenantContext() immediately
after resolving tenantId. This means every error in Sentry is tagged with
the tenant that caused it.

  app/(admin)/_lib/tenant/getCurrentTenant.ts — calls setSentryTenantContext() after line 26
  app/(guest)/_lib/tenant/resolveTenantFromHost.ts — calls it in both dev and prod branches

Never add Sentry.captureException() without first ensuring tenantId is in context.
Never remove or bypass setSentryTenantContext() calls.

Required env vars: SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN (same value)

---

## Database — connection pool + slow query detection

app/_lib/db/prisma.ts is the ONLY place PrismaClient is instantiated.

Configuration applied:
- transactionOptions: timeout 30s, maxWait 5s
- getDatabaseUrl() appends connection_limit=10, pool_timeout=20,
  statement_timeout=30000 to DATABASE_URL in non-dev environments
- Prisma errors + warnings route through log() as structured JSON
- In dev: queries over 1000ms emit log("warn", "prisma.slow_query", {...})

**Rules:**
- Never instantiate PrismaClient anywhere except app/_lib/db/prisma.ts
- Never run transactions without a timeout — transactionOptions is set globally
- Never add raw SQL without statement_timeout awareness

---

## Distributed cache — Upstash Redis

Redis client singleton: app/_lib/redis/client.ts
Import: `import { redis } from "@/app/_lib/redis/client"`

Never instantiate Redis directly. Never use @upstash/redis outside this singleton.

Required env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

Current usage:
- Rate limiting (checkout, payment intent, bookings) via @upstash/ratelimit
- Rate limiter: app/_lib/rate-limit/checkout.ts — sliding window, Upstash-backed

The old in-memory Map() rate limiter is fully removed. Never reintroduce it.
In-memory state resets on every deploy and is bypassed across Vercel instances.

---

## Rate limiting — Upstash Ratelimit

app/_lib/rate-limit/checkout.ts — distributed rate limiter, Upstash-backed.

Public function: `checkRateLimit(prefix, maxRequests, windowMs): Promise<boolean>`
Identifier format: prefix:clientIp (resolved from X-Forwarded-For)

Limits are set per-caller (e.g. 10 per 60min for checkout, 20 per 60min for bookings).
Analytics: enabled — visible in Upstash dashboard.
Dev mode: bypasses rate limiting entirely.

All checkout, payment-intent, booking, and update-guest routes call checkRateLimit()
before any business logic. Never add a new payment or booking route without it.

---

## Resilient HTTP — resilientFetch

app/_lib/http/fetch.ts is the ONLY place external HTTP calls are made.

Every adapter, every integration, every third-party API call uses resilientFetch().
Never call native fetch() directly for external services.

```typescript
import { resilientFetch } from "@/app/_lib/http/fetch"

const response = await resilientFetch(url, {
  service: "mailchimp",   // required — appears in structured logs
  timeout: 10_000,        // required — always set explicitly
  retries: 0,             // optional — defaults to 0
})
```

Timeout values by service category:
- Email marketing (Mailchimp etc.): 10_000ms
- Analytics/ads (Google Ads, Meta Ads): 8_000ms
- PMS adapters (Mews etc.): 15_000ms — PMS APIs can be legitimately slow
- Webhook delivery: 10_000ms
- All other external calls: 10_000ms

What resilientFetch provides automatically:
- AbortController timeout on every call
- Structured log on timeout: log("error", "http.timeout", { service, url, duration })
- Structured log on error: log("error", "http.error", { service, url, attempt })
- Slow response warning at >3s: log("warn", "http.slow_response", {...})
- URL sanitization in logs (strips tokens/API keys from query params)

Do NOT use resilientFetch for:
- Internal Next.js fetch() calls to /api/* routes
- Stripe SDK (has its own timeout handling)
- Clerk SDK (same)
- Prisma (not HTTP)

Currently wired in:
- app/_lib/apps/email-marketing/adapters/mailchimp.ts (8 calls)
- app/_lib/apps/google-ads/oauth.ts (3 calls)
- app/_lib/apps/google-ads/conversions.ts (2 calls)
- app/_lib/apps/meta-ads/oauth.ts (2 calls)
- app/_lib/apps/meta-ads/conversions.ts (1 call)
- app/_lib/apps/webhooks.ts (1 call)
- app/_lib/integrations/adapters/mews/client.ts (1 call, 15s timeout)

---

## Caching strategy — Shopify model

Every route has an explicit, motivated cache decision. Nothing is force-dynamic
without a documented reason. Nothing is cached without knowing the invalidation path.

**Cache decision per route type:**

ALWAYS force-dynamic (never cache — user-specific or transactional):
  - All /portal/* pages (guest session, orders, account)
  - All /checkout/* pages (payment, PaymentIntent)
  - All /p/[token]/* pages (booking-specific per guest)
  - /login/* (auth, magic link consumption, DB writes)
  - /order-status/* (live order status)
  - /check-in/*, /check-out/*

ISR with revalidate (cache + background revalidation):
  - /shop/products/[slug] → revalidate: 60 (product data)
  - /shop/collections/[slug] → revalidate: 60
  - /shop/gift-cards/* → revalidate: 60
  - /auth/login/[slug] → revalidate: 300 (tenant branding)

Static (no server data, build-time only):
  - /stays/confirmation (renders from URL params only)
  - /auth/error (hardcoded error text)

**unstable_cache() on shared hot-path functions:**

getTenantConfig() — app/(guest)/_lib/tenant/getTenantConfig.ts
  Cache key: ["tenant-config", tenantId]
  TTL: 300s (5 minutes)
  Tag: tenant-config:{tenantId}
  Invalidated by: publishDraft.ts + updateMenusLive.ts via revalidateTag()

resolveTenantFromHost() DB lookup — app/(guest)/_lib/tenant/resolveTenantFromHost.ts
  Cache key: ["tenant-by-host", host]
  TTL: 300s
  Tag: tenant-by-host:{host}
  Note: only the DB lookup is cached — setSentryTenantContext() runs every request

**Cache-Control headers (next.config.ts):**
  /_next/static/*  → public, max-age=31536000, immutable (1 year)
  /media/*         → public, max-age=3600, stale-while-revalidate=86400
  /api/*           → no-store
  Everything else  → Next.js ISR/static defaults (no catch-all no-store)

The old global no-store catch-all is permanently removed. Never reintroduce it.

**Cache invalidation on admin publish:**
publishDraft.ts and updateMenusLive.ts call both:
  revalidatePath("/(guest)", "layout")   — path-based
  revalidateTag(`tenant-config:${tenantId}`, { expire: 0 })  — tag-based

Never add a new admin mutation that writes to TenantConfig without
also calling revalidateTag(`tenant-config:${tenantId}`, { expire: 0 }).

---

## Database indexes

These composite indexes are in schema.prisma and must never be removed:

  Booking: @@index([tenantId, guestEmail])
    — covers guest portal session lookups

  Order: @@index([status, createdAt])
    — covers reconciliation cron + admin order views

  EmailSendLog: @@index([status, nextRetryAt])
    — covers email retry cron query

When adding new models or query patterns that filter by tenantId +
another column, always add a @@index. Never add a query without first
checking if an index exists for that filter combination.

---

## Structured logging

app/_lib/logger.ts — `log(level, event, ctx)` is the ONLY logging entry point.
Output: JSON with timestamp, level, event name, and context object.

Usage:
```typescript
log("info",  "order.created",    { tenantId, orderId, amount })
log("warn",  "prisma.slow_query", { duration, query })
log("error", "http.timeout",      { service, url, duration })
```

Never use console.log, console.warn, or console.error in new application code.
console.* produces unstructured output invisible in production monitoring.

All log events must include tenantId when it is available in scope.
All payment and order lifecycle events must be logged.

Current known gap: 152 console.* calls remain in the codebase as of the
enterprise audit. These are P2 — being migrated progressively.
Every new file must use log(), never console.*.

---

## Infrastructure invariants — never violate these

1. Sentry tenantId context is set before any business logic on every request
2. PrismaClient is instantiated exactly once — in app/_lib/db/prisma.ts
3. Redis client is instantiated exactly once — in app/_lib/redis/client.ts
4. All external HTTP calls go through resilientFetch() with service name + timeout
5. Email is always sent through sendEmailEvent() — never resendClient directly
6. Failed emails are retried — never silently dropped
7. Rate limiting is applied to all checkout, payment, and booking routes
8. getTenantConfig() and resolveTenantFromHost() DB lookups are always cached
9. Every admin mutation to TenantConfig calls revalidateTag() for cache invalidation
10. No global no-store header — cache decisions are per-route and explicit
11. No in-memory Map() for distributed state — Upstash Redis for everything
12. Structured logging only — console.* is banned in new code
13. Every new external service integration uses resilientFetch() from day one
14. Every new cron job follows the CRON_SECRET auth pattern and batches with take: N
