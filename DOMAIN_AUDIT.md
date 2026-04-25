# DOMAIN_AUDIT.md

Read-only audit of the domain system in the Bedfront codebase.
Generated 2026-04-25 against branch `main`.

## Repo top-level structure

```
$ ls /workspaces/book
admin   node_modules   package-lock.json   package.json   seoengine.md   skills   skills-lock.json
```

The actual application lives under `admin/` (single Next.js App Router app, not a monorepo).

```
$ ls /workspaces/book/admin
Build               eslint.config.mjs   middleware.test.ts   next-env.d.ts   package-lock.json   public            tsconfig.json
CLAUDE.md           lib                 middleware.ts        next.config.ts  package.json        scripts           tsconfig.tsbuildinfo
README.md           next                postcss.config.mjs   prisma          vercel.json         vitest.config.ts
app                 backups                                                                       vitest.setup.ts
check.js            docs
```

Shallow tree of `admin/app` (route groups + lib):

- `admin/app/(admin)/` — admin dashboard (route group, `rutgr.com/...`)
- `admin/app/(editor)/editor/`
- `admin/app/(guest)/` — booking engine on tenant subdomain (`*.rutgr.com`)
- `admin/app/(preview)/`, `admin/app/(preview-checkin)/`, `admin/app/(theme-demo)/`
- `admin/app/_lib/` — shared server modules (db, tenant, seo, integrations, …)
- `admin/app/api/` — API routes incl. `cron/`, `webhooks/`, `tenant/`, `internal/`

There is no top-level `src/` directory and no `prisma/` directory at the repo root —
Prisma lives at `admin/prisma/`.

## 1. Database schema (domains, tenants, markets, locales, verification, SSL)

### Prisma model and enum inventory

`admin/prisma/schema.prisma` is 5134 lines long. The relevant models and enums
discovered by greps for `domain`, `tenant`, `market`, `locale`, `region`, `country`,
`ssl`, `tls`, `cert`, `verif`, `host`, `cname`:

| Model / enum | Location | Relevance |
|---|---|---|
| `model Tenant` | `admin/prisma/schema.prisma:455` | Holds `slug`, `portalSlug`, sender-email fields |
| `model TenantLocale` | `admin/prisma/schema.prisma:1318` | Per-tenant published locales |
| `model TenantTranslation` | `admin/prisma/schema.prisma:1334` | Locale-keyed translation rows |
| `model EmailDomain` | `admin/prisma/schema.prisma:1456` | The ONLY model with a `domain` column — sender-domain verification via Resend |
| `enum EmailDomainStatus` | `admin/prisma/schema.prisma:1448` | `PENDING / VERIFIED / FAILED` |

There is **no** `Domain` model, no `CustomDomain`, no `TenantDomain`, no `Hostname`,
no `Certificate`, no `SSLCertificate`, no `Market`, no `Region`. Verified with:

```
$ rg -n -i 'model\s+(CustomDomain|Domain|TenantDomain|Hostname|Host|Certificate|SslCertificate|Market|Region)\s*\{' admin/prisma/schema.prisma
(no output)
```

### Verbatim — Tenant identity-relevant fields

```prisma
model Tenant {
  id String @id @default(cuid())

  // Clerk Organization mapping (1:1)
  clerkOrgId String @unique

  // Tenant identity
  name String
  slug String @unique

  // Portal subdomain — e.g. "grand-hotel-stockholm-x4k9mq"
  // Generates {name}-{random6}.rutgr.com automatically on creation.
  // Immutable once set. Nullable for backfill of existing tenants.
  portalSlug String? @unique
```
(`admin/prisma/schema.prisma:455-468`)

The Tenant indexes near the end of the model:
```prisma
  @@index([slug])
  @@index([clerkOrgId])
}
```
(`admin/prisma/schema.prisma:628-630`)

The Tenant model has these sender-email-identity fields (also relevant because
they are the *only* per-tenant fields whose values are domain strings):

```prisma
  // Email sender identity
  emailFrom     String? // e.g. "noreply@grandhotel.se"
  emailFromName String? // e.g. "Grand Hotel"

  // Email sender verification — pending change until confirmed via token
  pendingEmailFrom        String?
  emailVerificationToken  String?   @unique
  emailVerificationExpiry DateTime?
  emailVerificationSentTo String?
```
(`admin/prisma/schema.prisma:508-516`)

### Verbatim — `EmailDomain`

```prisma
// ============================================================================
// EMAIL DOMAINS (Per-tenant sender domain verification via Resend)
// ============================================================================

enum EmailDomainStatus {
  PENDING // added, DNS not yet configured
  VERIFIED // Resend confirmed DNS records are correct
  FAILED // verification failed
}

/// Per-tenant sender domain. Once verified, emails are sent from
/// noreply@[domain] instead of onboarding@resend.dev.
model EmailDomain {
  id             String            @id @default(cuid())
  tenantId       String
  domain         String // e.g. "grandhotel.se"
  resendDomainId String? // Resend's domain ID after creation
  status         EmailDomainStatus @default(PENDING)
  dnsRecords     Json? // DNS records returned by Resend
  verifiedAt     DateTime?
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, domain])
  @@index([tenantId])
}
```
(`admin/prisma/schema.prisma:1444-1471`)

### Verbatim — `TenantLocale`

```prisma
model TenantLocale {
  id        String   @id @default(cuid())
  tenantId  String
  locale    String // BCP-47: "en", "de", "fr", "sv" etc.
  published Boolean  @default(false)
  primary   Boolean  @default(false) // only one per tenant
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant       Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  translations TenantTranslation[]

  @@unique([tenantId, locale])
  @@index([tenantId, published])
}
```
(`admin/prisma/schema.prisma:1318-1332`)

### Migrations touching domains, hosts, SSL, certificates, verification

```
$ ls admin/prisma/migrations | grep -iE 'domain|host|ssl|cert|verif|cname|portal'
(no output — none of the active migration directory names contain these strings)
```

```
$ ls admin/prisma/migrations-archive-2026-04-21 | grep -iE 'domain|host|ssl|cert|verif|cname|portal'
(no output)
```

The active history was squashed on 2026-04-21 into
`20260421151049_squash_to_baseline`. The relevant table creations inside that
single SQL file:

`Tenant.portalSlug` column and unique index:
```sql
-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "clerkOrgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "portalSlug" TEXT,
    ...
);
```
(`admin/prisma/migrations/20260421151049_squash_to_baseline/migration.sql:175-186`)

```sql
CREATE UNIQUE INDEX "Tenant_portalSlug_key" ON "Tenant"("portalSlug");
```
(`admin/prisma/migrations/20260421151049_squash_to_baseline/migration.sql:1979`)

`EmailDomainStatus` enum:
```sql
CREATE TYPE "EmailDomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');
```
(`admin/prisma/migrations/20260421151049_squash_to_baseline/migration.sql:98`)

`EmailDomain` table:
```sql
-- CreateTable
CREATE TABLE "EmailDomain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "resendDomainId" TEXT,
    "status" "EmailDomainStatus" NOT NULL DEFAULT 'PENDING',
    "dnsRecords" JSONB,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDomain_pkey" PRIMARY KEY ("id")
);
```
(`admin/prisma/migrations/20260421151049_squash_to_baseline/migration.sql:517-530`)

```sql
CREATE INDEX "EmailDomain_tenantId_idx" ON "EmailDomain"("tenantId");
CREATE UNIQUE INDEX "EmailDomain_tenantId_domain_key" ON "EmailDomain"("tenantId", "domain");
```
(`admin/prisma/migrations/20260421151049_squash_to_baseline/migration.sql:2153, 2156`)

No archived migration name contains `domain`, `host`, `ssl`, `cert`, or `verif`.
Only `portalSlug`-bearing tables exist; no separate domain/cert/verification tables exist anywhere.


## 2. Tenant resolution from Host header

There are THREE separate host→tenant resolvers in the codebase. None of them
references a `Domain` table — the model is "subdomain == `Tenant.portalSlug`".

### Resolver A — guest-side (canonical hot path)

`admin/app/(guest)/_lib/tenant/resolveTenantFromHost.ts` — verbatim:

```ts
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/app/_lib/db/prisma";
import { env } from "@/app/_lib/env";
import { setSentryTenantContext } from "@/app/_lib/observability/sentry";

/**
 * Resolve tenant from the request host header (subdomain).
 *
 * Production: {portalSlug}.rutgr.com → lookup by portalSlug
 * Development: localhost → lookup by DEV_ORG_ID (Clerk org)
 *
 * Returns the tenant row or null if not found.
 * This is the guest-portal equivalent of getCurrentTenant() in admin.
 */
export async function resolveTenantFromHost() {
  const h = await headers();
  const host = h.get("host") ?? "";

  // Development fallback — no subdomain on localhost or Codespaces
  const isDev =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.endsWith(".app.github.dev");
  if (isDev) {
    if (!env.DEV_ORG_ID) return null;
    const tenant = await getCachedTenantByClerkOrg(env.DEV_ORG_ID);
    if (tenant) setSentryTenantContext(tenant.id, tenant.portalSlug ?? undefined);
    return tenant;
  }

  // Production: extract subdomain from {slug}.rutgr.com
  const dotIndex = host.indexOf(".");
  if (dotIndex === -1) return null;

  const portalSlug = host.slice(0, dotIndex);
  if (!portalSlug) return null;

  const tenant = await getCachedTenantByHost(portalSlug);
  if (tenant) setSentryTenantContext(tenant.id, portalSlug);
  return tenant;
}

// ── Cached DB lookups ────────────────────────────────────────────

function getCachedTenantByHost(portalSlug: string) {
  return unstable_cache(
    () => prisma.tenant.findUnique({ where: { portalSlug } }),
    ["tenant-by-host", portalSlug],
    {
      revalidate: 300,
      tags: [`tenant-by-host:${portalSlug}`],
    },
  )();
}

function getCachedTenantByClerkOrg(clerkOrgId: string) {
  return unstable_cache(
    () => prisma.tenant.findUnique({ where: { clerkOrgId } }),
    ["tenant-by-host", `clerk:${clerkOrgId}`],
    {
      revalidate: 300,
      tags: [`tenant-by-host:clerk:${clerkOrgId}`],
    },
  )();
}
```

Cache key shape: `["tenant-by-host", <portalSlug>]` or
`["tenant-by-host", "clerk:<DEV_ORG_ID>"]`.
TTL: 300s. Tag: `tenant-by-host:<key>`.

Fallback when no tenant matches: returns `null`. There is **no** redirect to a
marketing site, **no** default tenant, **no** thrown error. Each caller decides
what to do (typically `notFound()` or a 404-like response).

### Resolver A — call sites (44 total)

```
$ rg -n 'resolveTenantFromHost\(' admin --type ts | wc -l
44
```

File:line list (call sites only — excludes the definition itself):
```
admin/app/(guest)/check-in/page.tsx:15
admin/app/api/availability/route.ts:48
admin/app/(guest)/check-in/actions.ts:53
admin/app/(guest)/page.tsx:42
admin/app/(guest)/page.tsx:90
admin/app/(guest)/register/page.tsx:29
admin/app/api/portal/spot-booking/map/route.ts:33
admin/app/(guest)/checkout/page.tsx:40
admin/app/(guest)/search/page.tsx:26
admin/app/(guest)/search/page.tsx:53
admin/app/api/portal/checkout/session/cart/route.ts:65
admin/app/(guest)/checkout/success/page.tsx:32
admin/app/(guest)/layout.tsx:12
admin/app/(guest)/shop/products/[slug]/page.tsx:36
admin/app/(guest)/shop/products/[slug]/page.tsx:65
admin/app/api/portal/checkout/session/[token]/addons/route.ts:53
admin/app/api/portal/checkout/session/route.ts:96
admin/app/api/accommodation-types/route.ts:18
admin/app/(guest)/stays/[slug]/page.tsx:41
admin/app/(guest)/stays/[slug]/page.tsx:85
admin/app/api/checkout/create/route.ts:57
admin/app/(guest)/shop/gift-cards/[slug]/page.tsx:53
admin/app/(guest)/stays/[slug]/addons/page.tsx:31
admin/app/(guest)/shop/gift-cards/page.tsx:21
admin/app/(guest)/stays/[slug]/book/page.tsx:17
admin/app/(guest)/shop/gift-cards/confirmation/page.tsx:15
admin/app/api/checkout/validate-discount/route.ts:40
admin/app/(guest)/login/page.tsx:34
admin/app/_lib/products/actions.ts:1289
admin/app/_lib/products/actions.ts:1304
admin/app/(guest)/_lib/sitemap/route-helpers.ts:70
admin/app/api/checkout/payment-intent/route.ts:79
admin/app/(guest)/shop/layout.tsx:14
admin/app/(guest)/stays/categories/[slug]/page.tsx:32
admin/app/(guest)/stays/categories/[slug]/page.tsx:57
admin/app/api/checkout/update-guest/route.ts:44
admin/app/(guest)/shop/collections/[slug]/page.tsx:26
admin/app/(guest)/shop/collections/[slug]/page.tsx:51
admin/app/api/checkout/purchase-intent/route.ts:77
admin/app/api/bookings/create/route.ts:51
admin/app/api/analytics/events/route.ts:63
admin/app/_lib/checkout/engine.ts:56
```
(43 call sites — the 44th `rg` hit is the export in `resolveTenantFromHost.ts:16` itself.)

### Resolver B — admin-side (Clerk-org based, NOT host based)

`admin/app/(admin)/_lib/tenant/getCurrentTenant.ts` — verbatim:

```ts
"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { getAuth } from "../auth/devAuth";
import { setSentryTenantContext } from "@/app/_lib/observability/sentry";

/**
 * Get the current tenant for the authenticated admin user.
 *
 * Returns the full Tenant record (including settings, draftSettings,
 * settingsVersion, previousSettings) plus auth context.
 *
 * Returns null if not authenticated or tenant not found.
 */
export async function getCurrentTenant() {
  const { userId, orgId } = await getAuth();

  if (!userId || !orgId) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
  });

  if (!tenant) return null;

  try {
    setSentryTenantContext(tenant.id, tenant.portalSlug ?? undefined);
  } catch {
    // Sentry unavailable — safe to ignore
  }

  return {
    tenant,
    clerkUserId: userId,
    clerkOrgId: orgId,
  };
}
```

This resolver does NOT read the host header. The admin app runs on the bare
`rutgr.com` apex; tenant identity comes from the Clerk session organisation.
Call sites: `rg -n 'getCurrentTenant\(' admin --type ts | wc -l` → **191**.

### Resolver C — guest-auth helpers

`admin/app/_lib/guest-auth/resolve-tenant.ts` exports two functions
(`resolveGuestTenant` and `resolveGuestTenantFromHeaders`) that ALSO parse host
to `portalSlug` — verbatim of the parsing function:

```ts
const BASE_DOMAIN = "rutgr.com";
const IS_DEV = process.env.NODE_ENV === "development";

function extractPortalSlug(host: string): string | null {
  // Strip port if present
  const hostname = host.split(":")[0];

  // Must be a subdomain of rutgr.com
  if (!hostname.endsWith(`.${BASE_DOMAIN}`)) return null;

  const slug = hostname.slice(0, -(BASE_DOMAIN.length + 1));
  return slug || null;
}
```
(`admin/app/_lib/guest-auth/resolve-tenant.ts:16-38`)

This duplicates Resolver A's logic but uses a hardcoded `BASE_DOMAIN = "rutgr.com"`
and reads `process.env.DEV_GUEST_PORTAL_SLUG` / `process.env.DEV_ORG_ID` directly
(no `env` Zod import). Has no `unstable_cache` wrapper — every call hits the DB.
Returns only `tenantId` (string), not the full Tenant row.

### Resolver D — middleware companion (internal API)

`admin/app/api/internal/resolve-tenant-by-host/route.ts` exists because the
edge-runtime middleware cannot import Prisma. The middleware calls this route
with `x-cron-secret`:

```ts
function isDevHost(host: string): boolean {
  return (
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.endsWith(".app.github.dev")
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const host = new URL(request.url).searchParams.get("host");
  if (!host) {
    return NextResponse.json({ error: "Missing host" }, { status: 400 });
  }

  let tenant: { id: string } | null = null;

  if (isDevHost(host)) {
    if (env.DEV_ORG_ID) {
      tenant = await prisma.tenant.findUnique({
        where: { clerkOrgId: env.DEV_ORG_ID },
        select: { id: true },
      });
    }
  } else {
    const dotIndex = host.indexOf(".");
    if (dotIndex > 0) {
      const portalSlug = host.slice(0, dotIndex);
      if (portalSlug) {
        tenant = await prisma.tenant.findUnique({
          where: { portalSlug },
          select: { id: true },
        });
      }
    }
  }

  if (!tenant) {
    return NextResponse.json({ tenant: null });
  }

  const primary = await prisma.tenantLocale.findFirst({
    where: { tenantId: tenant.id, primary: true },
    select: { locale: true },
  });

  return NextResponse.json({
    tenant: {
      id: tenant.id,
      defaultLocale: primary?.locale ?? FALLBACK_LOCALE,
    },
  });
}
```
(`admin/app/api/internal/resolve-tenant-by-host/route.ts:34-90`)

This route is uncached at the route level but the middleware wraps it in a
TTL cache (see Section 3).

### Other ad-hoc host parsing

`rg -n 'host\.split|host\.endsWith|host\.startsWith|host\.indexOf|host\.slice' admin --type ts -g '!*.test.ts'`
returned 17 matches. The non-resolver matches are:

```
admin/app/(admin)/_lib/tenant/getTenantBaseUrl.ts:25            // builds preview URL
admin/app/(admin)/_components/SearchListingPreview/SearchListingPreview.tsx:153  // preview-display only
admin/app/(admin)/settings/checkin/actions.ts:39                // builds redirect URL
admin/app/_lib/checkout/types/cart.ts:158                       // dev-vs-prod check
admin/app/api/checkout/create/route.ts:310                      // dev-vs-prod check
```

There is **no** `x-forwarded-host` reader anywhere in the codebase:

```
$ rg -n 'x-forwarded-host' admin --type ts
(no output)
```

### Caching layer summary

| Resolver | Cache | Key | TTL |
|---|---|---|---|
| A `resolveTenantFromHost` | `unstable_cache` | `["tenant-by-host", portalSlug]` (or `clerk:<id>`) | 300 s |
| B `getCurrentTenant` | none | — | — |
| C `resolveGuestTenant*` | none | — | — |
| D `/api/internal/resolve-tenant-by-host` | none at route; in-memory TTL cache in middleware (see §3) | — | — |

Per CLAUDE.md (admin/CLAUDE.md, "Caching strategy" section) the documented
contract is: "**only the DB lookup is cached** — `setSentryTenantContext()` runs
every request." Resolver A respects this; Resolver C bypasses caching entirely.

### Fallback behaviour

All resolvers return `null` when no tenant matches. There is no redirect to a
marketing landing page, no fallback tenant. Callers handle null individually
(see §12 for the leakage analysis).


## 3. Next.js middleware

`admin/middleware.ts` is 491 lines. Quoted in full:

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SUPPORTED_LOCALES, PRIMARY_LOCALE } from '@/app/_lib/translations/locales';
import { getCachedLocalePublished, setCachedLocalePublished } from '@/app/_lib/translations/locale-cache';
import { normalizeRedirectPath } from '@/app/_lib/seo/redirects/paths';

const isPublicRoute = createRouteMatcher([
  '/',
  '/p/(.*)',
  '/shop/(.*)',
  '/stays(.*)',
  '/checkout(.*)',
  '/api/checkout/(.*)',
  '/api/availability(.*)',
  '/api/bookings/(.*)',
  '/check-in(.*)',
  '/check-out(.*)',
  '/preview/(.*)',
  '/api/webhooks/(.*)',
  '/api/admin/(.*)',
  '/api/email-sender/verify/confirm(.*)',
  // Platform health + readiness probes — intentionally unauthenticated so
  // Vercel deployment checks, uptime monitors, and on-call curl work
  // without Clerk sessions. Response bodies are minimal by design.
  '/api/health(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/auth/(.*)',
  '/unsubscribe(.*)',
  '/api/guest-auth/(.*)',
  '/api/portal/(.*)',
  '/login(.*)',
  '/register(.*)',
  '/no-booking(.*)',
  // Session-gated guest pages — public for Clerk (guests don't have Clerk accounts),
  // but gated by guest_session cookie check below.
  '/account(.*)',
  '/portal/(.*)',
]);

// All valid locale codes as a Set for O(1) lookup
const LOCALE_CODES: Set<string> = new Set(SUPPORTED_LOCALES.map((l) => l.code));

// ── Resolve tenant from token ────────────────────────────────
// token → tenantId via internal API call. Edge-safe (no prisma).
// Cached with 5 min TTL (tokens don't change tenant).
interface TenantResolution {
  tenantId: string | null;
  primaryLocale: string;
}

const tenantCache = new Map<string, { value: TenantResolution; expiresAt: number }>();

async function resolveTenantFromToken(request: NextRequest, token: string): Promise<TenantResolution> {
  const fallback: TenantResolution = { tenantId: null, primaryLocale: PRIMARY_LOCALE };

  // Preview/test tokens don't need locale validation
  if (token === 'preview' || token === 'test') return fallback;

  const cached = tenantCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  // Call internal API to resolve token → tenantId + primaryLocale (Node.js route has prisma)
  try {
    const url = new URL('/api/translations/locales/published', request.nextUrl.origin);
    url.searchParams.set('resolveToken', token);
    const res = await fetch(url.toString(), {
      headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
    });
    if (res.ok) {
      const data = await res.json();
      const result: TenantResolution = {
        tenantId: data.tenantId ?? null,
        primaryLocale: data.primaryLocale ?? PRIMARY_LOCALE,
      };
      tenantCache.set(token, { value: result, expiresAt: Date.now() + 300_000 });
      return result;
    }
  } catch (err) {
    console.error('[middleware] Failed to resolve tenant from token:', err);
  }

  tenantCache.set(token, { value: fallback, expiresAt: Date.now() + 60_000 });
  return fallback;
}

// ── Check locale published via cache + internal API ──────────

async function checkLocalePublished(
  request: NextRequest,
  tenantId: string,
  locale: string,
  tenantPrimaryLocale?: string,
): Promise<boolean> {
  // Check in-memory cache first (primary locale always returns true)
  const cached = getCachedLocalePublished(tenantId, locale, tenantPrimaryLocale);
  if (cached !== null) return cached;

  // Cache miss — call internal API (Node.js, has prisma)
  try {
    const url = new URL('/api/translations/locales/published', request.nextUrl.origin);
    url.searchParams.set('tenantId', tenantId);
    url.searchParams.set('locale', locale);
    const res = await fetch(url.toString(), {
      headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
    });
    if (res.ok) {
      const data = await res.json();
      const published = data.published === true;
      setCachedLocalePublished(tenantId, locale, published);
      return published;
    }
  } catch (err) {
    console.error('[middleware] Failed to check locale published:', err);
  }

  return false;
}

// ── Locale detection from URL path ───────────────────────────

interface LocaleResolution {
  locale: string;
  token: string | null;
  rewriteUrl: URL | null;
}

function resolveLocaleFromPath(request: NextRequest): LocaleResolution {
  const pathname = request.nextUrl.pathname;

  // Match /{locale}/p/[token]/... — locale prefix before token-based guest routes
  const tokenMatch = pathname.match(/^\/([a-z]{2})(\/p\/[^/]+.*)$/);
  if (tokenMatch && LOCALE_CODES.has(tokenMatch[1])) {
    const restPath = tokenMatch[2];
    const token = restPath.match(/^\/p\/([^/]+)/)?.[1] ?? null;
    return { locale: tokenMatch[1], token, rewriteUrl: new URL(restPath, request.url) };
  }

  // Match /{locale}/checkout, /{locale}/stays, /{locale}/shop, /{locale}/search, ...
  // Subdomain-based routes — no token needed
  const guestMatch = pathname.match(/^\/([a-z]{2})(\/(checkout|stays|shop|search|account|portal|login|register|order-status)(\/.*)?$)/);
  if (guestMatch && LOCALE_CODES.has(guestMatch[1])) {
    const restPath = guestMatch[2];
    return { locale: guestMatch[1], token: null, rewriteUrl: new URL(restPath, request.url) };
  }

  return { locale: PRIMARY_LOCALE, token: null, rewriteUrl: null };
}

// ── Apply locale to response ─────────────────────────────────

async function handleLocale(request: NextRequest): Promise<NextResponse | null> {
  const { locale, token, rewriteUrl } = resolveLocaleFromPath(request);

  // No locale segment detected — resolve tenant's primary locale for the header
  if (!rewriteUrl) {
    // Try to resolve tenant primary from token in the path (e.g. /p/{token}/...)
    const pathTokenMatch = request.nextUrl.pathname.match(/^\/p\/([^/]+)/);
    const pathToken = pathTokenMatch?.[1] ?? null;
    let effectiveLocale = locale; // defaults to PRIMARY_LOCALE

    if (pathToken) {
      const { primaryLocale } = await resolveTenantFromToken(request, pathToken);
      effectiveLocale = primaryLocale;
    }

    const response = NextResponse.next();
    response.headers.set('x-tenant-locale', effectiveLocale);
    return response;
  }

  // Locale segment detected — resolve tenant and validate published state
  const resolved = token ? await resolveTenantFromToken(request, token) : null;
  const tenantPrimaryLocale = resolved?.primaryLocale ?? PRIMARY_LOCALE;

  if (locale !== tenantPrimaryLocale && resolved?.tenantId) {
    const published = await checkLocalePublished(request, resolved.tenantId, locale, tenantPrimaryLocale);
    if (!published) {
      return new NextResponse('Not Found', { status: 404 });
    }
  }

  const response = NextResponse.rewrite(rewriteUrl);
  response.headers.set('x-tenant-locale', locale);
  return response;
}

// ── Session-gated guest routes ───────────────────────────────
// These routes require a guest_session cookie (set by OTP auth).
// This is a lightweight presence check — the page's server component
// does full validation via resolveGuestContext() (decrypts + verifies).
//
// Preview routes (/preview/*, /devtest*) render /p/[token] components
// with token="preview". They never use /home, /stays, /account —
// session gating does not affect editor previews, email previews,
// or check-in card previews.

const SESSION_GATED_ROUTES = createRouteMatcher([
  '/account(.*)',
  '/portal/(.*)',
]);

const GUEST_SESSION_COOKIE = 'guest_session';

function handleGuestSessionGate(request: NextRequest): NextResponse | null {
  if (!SESSION_GATED_ROUTES(request)) return null;

  const hasSession = request.cookies.has(GUEST_SESSION_COOKIE);
  if (hasSession) return null; // pass through — page validates fully

  // No session → redirect to login
  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

// ── SEO redirects (M11.1b) ───────────────────────────────────
//
// Serves 301/302 redirects from the `SeoRedirect` table for
// paths whose entity slug has changed. Runs BEFORE session
// gating, auth, and locale handling — a renamed product must
// redirect regardless of who the visitor is.
//
// Edge runtime can't use Prisma, so lookups go through two
// internal Node.js routes:
//   /api/internal/resolve-tenant-by-host  → tenantId + locale
//   /api/internal/seo-redirect-lookup     → redirect row or null
//
// Both responses are LRU-cached for 60s (positive AND negative).
// Negative caching is load-bearing: every 404 under /stays/*
// would otherwise round-trip to Prisma.
//
// Hit logging (`/api/internal/seo-redirect-hit`) is fire-and-
// forget — never awaited, never blocks the 301.

const SEO_REDIRECT_CACHE_TTL_MS = 60_000;
const SEO_TENANT_CACHE_TTL_MS = 60_000;
const SEO_REDIRECT_CACHE_MAX_SIZE = 5000;
const SEO_TENANT_CACHE_MAX_SIZE = 1000;

// Fast-path filter. Only paths under these prefixes own merchant-
// editable slugs and therefore can have redirects. Keeps non-
// redirectable paths (e.g. /api/*, /editor/*, /_next/*) from
// round-tripping to the DB — critical at 10k-tenant scale.
// Case-insensitive: `/Shop/Products/FOO` still takes the redirect
// path (normalizeRedirectPath lowercases before lookup). A case-
// sensitive filter would miss crawler/legacy uppercase variants.
const SEO_REDIRECTABLE_PATH_PATTERN =
  /^\/(stays(\/categories)?|shop\/(products|collections))\//i;

type SeoRedirectRow = {
  id: string;
  toPath: string;
  statusCode: number;
};

type SeoTenantRow = {
  id: string;
  defaultLocale: string;
};

const seoRedirectCache = new Map<
  string,
  { value: SeoRedirectRow | null; expiresAt: number }
>();
const seoTenantCache = new Map<
  string,
  { value: SeoTenantRow | null; expiresAt: number }
>();

function cacheSeoTenant(host: string, value: SeoTenantRow | null): void {
  seoTenantCache.set(host, {
    value,
    expiresAt: Date.now() + SEO_TENANT_CACHE_TTL_MS,
  });
  if (seoTenantCache.size > SEO_TENANT_CACHE_MAX_SIZE) {
    const firstKey = seoTenantCache.keys().next().value;
    if (firstKey !== undefined) seoTenantCache.delete(firstKey);
  }
}

function cacheSeoRedirect(key: string, value: SeoRedirectRow | null): void {
  seoRedirectCache.set(key, {
    value,
    expiresAt: Date.now() + SEO_REDIRECT_CACHE_TTL_MS,
  });
  if (seoRedirectCache.size > SEO_REDIRECT_CACHE_MAX_SIZE) {
    const firstKey = seoRedirectCache.keys().next().value;
    if (firstKey !== undefined) seoRedirectCache.delete(firstKey);
  }
}

async function resolveTenantByHostCached(
  request: NextRequest,
  host: string,
): Promise<SeoTenantRow | null> {
  const cached = seoTenantCache.get(host);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const url = new URL(
      '/api/internal/resolve-tenant-by-host',
      request.nextUrl.origin,
    );
    url.searchParams.set('host', host);

    const res = await fetch(url.toString(), {
      headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
    });

    if (!res.ok) {
      cacheSeoTenant(host, null);
      return null;
    }

    const data = (await res.json()) as { tenant: SeoTenantRow | null };
    const value = data.tenant ?? null;
    cacheSeoTenant(host, value);
    return value;
  } catch (err) {
    console.error('[middleware] Failed to resolve tenant for SEO redirect:', err);
    cacheSeoTenant(host, null);
    return null;
  }
}

async function lookupSeoRedirectCached(
  request: NextRequest,
  tenantId: string,
  path: string,
  locale: string,
): Promise<SeoRedirectRow | null> {
  const key = `${tenantId}|${path}|${locale}`;
  const cached = seoRedirectCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const url = new URL(
      '/api/internal/seo-redirect-lookup',
      request.nextUrl.origin,
    );
    url.searchParams.set('tenantId', tenantId);
    url.searchParams.set('path', path);
    url.searchParams.set('locale', locale);

    const res = await fetch(url.toString(), {
      headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
    });

    if (!res.ok) {
      cacheSeoRedirect(key, null);
      return null;
    }

    const data = (await res.json()) as { redirect: SeoRedirectRow | null };
    const value = data.redirect ?? null;
    cacheSeoRedirect(key, value);
    return value;
  } catch (err) {
    console.error('[middleware] Failed SEO redirect lookup:', err);
    cacheSeoRedirect(key, null);
    return null;
  }
}

async function emitSeoRedirectHit(
  request: NextRequest,
  tenantId: string,
  redirectId: string,
): Promise<void> {
  try {
    const url = new URL(
      '/api/internal/seo-redirect-hit',
      request.nextUrl.origin,
    );
    await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cron-secret': process.env.CRON_SECRET ?? '',
      },
      body: JSON.stringify({ tenantId, redirectId }),
    });
  } catch {
    // Hit logging failures never affect request flow.
  }
}

// Test-only: reset caches between test runs. Module state is shared
// across imports, and middleware.test.ts needs a clean slate per
// scenario to verify cache hit vs miss behaviour.
export function __resetSeoRedirectCachesForTest(): void {
  seoRedirectCache.clear();
  seoTenantCache.clear();
}

export async function handleSeoRedirect(
  request: NextRequest,
): Promise<NextResponse | null> {
  const rawPath = request.nextUrl.pathname;
  if (!SEO_REDIRECTABLE_PATH_PATTERN.test(rawPath)) return null;

  const host = request.headers.get('host');
  if (!host) return null;

  const tenant = await resolveTenantByHostCached(request, host);
  if (!tenant) return null;

  const normalizedPath = normalizeRedirectPath(rawPath);
  const redirect = await lookupSeoRedirectCached(
    request,
    tenant.id,
    normalizedPath,
    tenant.defaultLocale,
  );
  if (!redirect) return null;

  void emitSeoRedirectHit(request, tenant.id, redirect.id);

  const destUrl = new URL(redirect.toPath, request.url);
  for (const [key, value] of request.nextUrl.searchParams) {
    destUrl.searchParams.set(key, value);
  }

  return NextResponse.redirect(destUrl, redirect.statusCode);
}

// ── Middleware entry point ────────────────────────────────────

// I dev: skippa Clerk helt — ingen handshake, ingen redirect
const middleware = process.env.NODE_ENV === 'development'
  ? async (request: NextRequest) => {
      const seoRedirect = await handleSeoRedirect(request);
      if (seoRedirect) return seoRedirect;

      const guestRedirect = handleGuestSessionGate(request);
      if (guestRedirect) return guestRedirect;
      return await handleLocale(request);
    }
  : clerkMiddleware(async (auth, request) => {
      const seoRedirect = await handleSeoRedirect(request);
      if (seoRedirect) return seoRedirect;

      const guestRedirect = handleGuestSessionGate(request);
      if (guestRedirect) return guestRedirect;

      if (!isPublicRoute(request)) {
        await auth.protect();
      }

      return await handleLocale(request);
    });

export default middleware;

export const config = {
  matcher: [
    // Admin routes — all pages in (admin) route group
    '/dashboard(.*)',
    '/design(.*)',
    '/home(.*)',
    '/files(.*)',
    '/maps(.*)',
    '/menus(.*)',
    '/settings(.*)',
    '/translations(.*)',
    '/themes(.*)',
    '/editor(.*)',
    '/preview-demo(.*)',
    '/preview-test(.*)',
    '/sign-in(.*)',
    '/sign-up(.*)',
    // API routes (except webhooks and media — those handle their own auth)
    '/(api(?!/webhooks|/media))(.*)',
    // Guest portal paths — needed for locale detection
    '/p/(.*)',
    '/checkout(.*)',
    '/shop/(.*)',
    '/stays(.*)',
    '/check-in(.*)',
    '/check-out(.*)',
    '/login(.*)',
    '/no-booking(.*)',
    '/portal/(.*)',
    // Locale-prefixed guest routes: /{locale}/p/..., /{locale}/checkout, etc.
    '/:path((?:[a-z]{2})/p/.*)',
    '/:path((?:[a-z]{2})/checkout.*)',
    '/:path((?:[a-z]{2})/stays.*)',
    '/:path((?:[a-z]{2})/shop.*)',
  ],
};
```

### Matcher config

`config.matcher` — quoted above (lines 456–491 of `admin/middleware.ts`):
admin route prefixes (`/dashboard`, `/design`, `/home`, `/files`, `/maps`, `/menus`,
`/settings`, `/translations`, `/themes`, `/editor`, `/preview-demo`, `/preview-test`,
`/sign-in`, `/sign-up`), all `/api/*` except `/api/webhooks` and `/api/media`,
guest portal paths (`/p/*`, `/checkout`, `/shop/*`, `/stays`, `/check-in`,
`/check-out`, `/login`, `/no-booking`, `/portal/*`), and locale-prefixed guest
routes (`/{locale}/p/*`, `/{locale}/checkout*`, `/{locale}/stays*`, `/{locale}/shop*`).

### Rewrites, redirects, and header mutations that depend on host or domain

| Operation | Trigger | Lines |
|---|---|---|
| `NextResponse.redirect(destUrl, redirect.statusCode)` (SEO 301/302) | `host` header parsed → tenant resolved → SeoRedirect row found | `admin/middleware.ts:425` |
| `NextResponse.rewrite(rewriteUrl)` (locale stripping `/{locale}/...` → `/...`) | Path locale-prefix match | `admin/middleware.ts:184` |
| `response.headers.set('x-tenant-locale', ...)` | Always set on locale-bearing responses | `admin/middleware.ts:169, 185` |
| `NextResponse.redirect(loginUrl)` (guest session gate) | Missing `guest_session` cookie on `/account/*`, `/portal/*` | `admin/middleware.ts:213-214` |

The middleware does NOT canonicalise host case, does NOT redirect www → apex (or
vice-versa), does NOT redirect HTTP → HTTPS (relies on Vercel for that), and does
NOT redirect any "secondary domain" to a "primary domain" — there is no concept
of secondary/primary domain in the code.

### Primary vs secondary domain handling

**Does not exist.** Verified:

```
$ rg -n -i 'primaryDomain|secondaryDomain|primary_domain|isPrimary.*domain' admin --type ts
(no output)
$ rg -n 'primary.*301|primary.*redirect' admin/middleware.ts
(no output)
```

Each tenant has exactly one host: `{portalSlug}.rutgr.com`. Multiple-domain
support is absent at the schema, code, and middleware layer.

## 4. DNS / SSL provisioning integration

### Vercel Domains API

**Does not exist.** No code in the repo calls Vercel's domains API. Verified:

```
$ rg -n -i 'vercel.*api/domains|@vercel/domains|api.vercel.com/v[0-9]+/domains' admin --type ts
(no output)
$ rg -n 'addDomain|verifyDomain|provisionCert' admin --type ts
(no output)
$ rg -n -i 'acme|letsencrypt' admin --type ts
(no output — no certificate authority code)
```

Wildcard `*.rutgr.com` DNS is provisioned manually at the Vercel dashboard
level (per CLAUDE.md / "Domain & subdomain infrastructure" section, declared
documentation only — there is no code that adds or verifies a domain at Vercel).

### Resend Domains API (the only "domains API" wired in)

`admin/app/_lib/email/domains.ts` is the SINGLE adapter file. Quoted exported
signatures:

```ts
export interface DnsRecord {
  type: string;
  name: string;
  value: string;
  ttl?: string;
}

export interface ResendDomainResult {
  resendDomainId: string;
  dnsRecords: DnsRecord[];
  status: "pending" | "verified" | "failed";
}

export async function createResendDomain(
  domain: string,
): Promise<ResendDomainResult>
// Body: calls resendClient.domains.create({ name: domain }), maps records,
// returns { resendDomainId, dnsRecords, status: "pending" }.

export async function getResendDomainStatus(
  resendDomainId: string,
): Promise<{ status: "pending" | "verified" | "failed" }>
// Body: calls resendClient.domains.get(resendDomainId), maps Resend's "verified"/
// "failed"/"temporary_failure"/anything-else to a normalized status.

export async function deleteResendDomain(
  resendDomainId: string,
): Promise<void>
// Body: calls resendClient.domains.remove(resendDomainId).
```
(`admin/app/_lib/email/domains.ts:11-89`)

### Where domains are added to Resend

`admin/app/(admin)/settings/email/domain-actions.ts` — server actions
`addEmailDomain()` (line 48), `checkDomainVerification()` (line 110), and
`removeEmailDomain()` (line 181). First 20 lines of `addEmailDomain`:

```ts
export async function addEmailDomain(domain: string): Promise<{
  success: boolean;
  error?: string;
  domain?: EmailDomainRecord;
}> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { success: false, error: "Inte inloggad" };

  const normalized = domain.trim().toLowerCase();

  if (!DOMAIN_REGEX.test(normalized)) {
    return { success: false, error: "Ogiltigt domänformat" };
  }

  // Check not already added
  const existing = await prisma.emailDomain.findUnique({
    where: {
      tenantId_domain: {
```
(`admin/app/(admin)/settings/email/domain-actions.ts:48-72`)

### Where SSL status is read

There is no SSL/TLS status tracking. `EmailDomain.status` reflects only DNS-record
verification at Resend — i.e. whether SPF/DKIM TXT records resolve, NOT whether a
TLS certificate has been issued for the domain. Verified:

```
$ rg -n -i 'sslStatus|certificateStatus|tlsStatus|ssl.*expires|cert.*expires' admin --type ts
(no output)
```

`checkDomainVerification()` reads Resend's status via `getResendDomainStatus()`
and writes the result into `EmailDomain.status` (`PENDING / VERIFIED / FAILED`)
plus optionally bootstraps `Tenant.emailFrom` when the row first transitions to
`VERIFIED`:

```ts
if (mappedStatus === "VERIFIED" && domain.status !== "VERIFIED") {
  const now = new Date();
  await prisma.emailDomain.update({
    where: { id: domainId },
    data: { status: "VERIFIED", verifiedAt: now },
  });

  // Auto-set emailFrom on tenant if not already set
  const tenant = tenantData.tenant;
  if (!tenant.emailFrom) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        emailFrom: `noreply@${domain.domain}`,
        emailFromName: tenant.emailFromName ?? tenant.name,
      },
    });
  }
```
(`admin/app/(admin)/settings/email/domain-actions.ts:140-157`)

### Renewal logic

**Does not exist.** No code re-verifies, re-polls, or refreshes a domain's
status after the initial check. `checkDomainVerification` is only called from
the admin UI (manual button click). Verified:

```
$ ls admin/app/api/cron/ | grep -iE 'domain|email.*verify|cert|ssl'
(no output)
```

The Vercel `vercel.json` cron list contains no domain-renewal cron:

```
$ rg -n 'domain|cert|ssl' admin/vercel.json
(no output)
```

### Retry / queue / dead-letter logic for domain operations

**Does not exist.** Resend domain operations throw on error and are not
queued / retried. From `admin/app/_lib/email/domains.ts:33-37`:

```ts
if (error || !data) {
  throw new Error(
    `[email/domains] Failed to create domain "${domain}": ${error?.message ?? "Unknown error"}`,
  );
}
```

Caller behaviour at `addEmailDomain`:
```ts
try {
  const result = await createResendDomain(normalized);
  …
} catch (error) {
  console.error("[addEmailDomain] Error:", error);
  const message = error instanceof Error ? error.message : "Okänt fel";
  return { success: false, error: `Kunde inte lägga till domänen: ${message}` };
}
```
(`admin/app/(admin)/settings/email/domain-actions.ts:78-105`)

There is no PmsWebhookInbox-style outbox table, no retry cron, no dead-letter
state for domain operations.

### Data flow when a tenant adds a domain

The chain (only the **email-sender domain** flow exists — there is no custom
"site" domain flow):

1. User submits form in admin UI (see §6).
2. Server action `addEmailDomain(domain)` runs in
   `admin/app/(admin)/settings/email/domain-actions.ts:48`.
3. `requireAdmin()` + `getCurrentTenant()` gate the call.
4. `DOMAIN_REGEX = /^[a-z0-9]+([-.]?[a-z0-9]+)*\.[a-z]{2,}$/i` validates input
   (`admin/app/(admin)/settings/email/domain-actions.ts:23`).
5. Existence check on `EmailDomain` (`@@unique([tenantId, domain])`).
6. `createResendDomain(normalized)` → `resendClient.domains.create({ name })`.
7. `prisma.emailDomain.create({...})` persists `tenantId, domain, resendDomainId,
   status: "PENDING", dnsRecords: <Resend's TXT records>`.
8. UI displays the DNS records to the user; no further automation.
9. User must click "Verifiera" → `checkDomainVerification(domainId)` →
   `resendClient.domains.get(resendDomainId)` → maps Resend status → updates
   `EmailDomain.status` and optionally writes `Tenant.emailFrom`.

There is **no** queue, **no** retry, **no** scheduled re-verification, and
**no** issuance of TLS certificates anywhere in this flow.


## 5. Domain ownership verification

There is **no** TXT-based domain-ownership verification of the kind Shopify
uses (`shopify-verification` or `bedfront-verification` TXT records on a custom
domain). Verified:

```
$ rg -n -i 'bedfront_verification|bedfront-verify|TXT.*record|claimDomain|verifyDomain.*txt' admin --type ts
(no output)
$ rg -n -i 'verify_token.*domain|domain.*claim|domain.*ownership' admin --type ts
(no output)
$ rg -n -i 'dig\b|dns.*resolve|resolveTxt|resolve\.txt' admin --type ts
(no output)
```

Two unrelated verification flows exist; neither verifies ownership of a *site*
domain.

### Verification flow A — Resend SPF/DKIM TXT verification (sender domain)

This is delegated to Resend; Bedfront does NOT do its own DNS lookup.

- The TXT records to publish are returned by `resendClient.domains.create()` and
  stored verbatim on `EmailDomain.dnsRecords` (see §1).
- The status enum is `EmailDomainStatus { PENDING, VERIFIED, FAILED }`
  (`admin/prisma/schema.prisma:1448-1452`).
- The transition site is `checkDomainVerification` —
  `admin/app/(admin)/settings/email/domain-actions.ts:110`. It maps Resend's
  string status to the enum:

```ts
const mappedStatus =
  result.status === "verified"
    ? "VERIFIED"
    : result.status === "failed"
      ? "FAILED"
      : "PENDING";
```
(`admin/app/(admin)/settings/email/domain-actions.ts:133-138`)

- Verification is **one-shot, manually triggered**. No cron re-polls Resend.
- No "FAILED → re-attempt" path exists; the user must remove and re-add the
  domain.

### Verification flow B — sender-email address proof-of-control

This proves that the tenant operator controls the *email address* listed as the
sender, not that they control a domain. Tracked on the `Tenant` table, not
`EmailDomain`:

```prisma
  pendingEmailFrom        String?
  emailVerificationToken  String?   @unique
  emailVerificationExpiry DateTime?
  emailVerificationSentTo String?
```
(`admin/prisma/schema.prisma:512-516`)

Token generation:
```ts
const token = randomBytes(32).toString("hex");
const expiry = new Date(Date.now() + TOKEN_EXPIRY_MS);
```
(`admin/app/api/email-sender/verify/initiate/route.ts:65-66`, with
`const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;`)

Confirmation route quotes the redirect targets verbatim:
```ts
if (!tenant || !tenant.pendingEmailFrom || !tenant.emailVerificationExpiry) {
  return NextResponse.redirect(`${appUrl}/sign-in?error=link_expired`);
}

if (tenant.emailVerificationExpiry < new Date()) {
  return NextResponse.redirect(`${appUrl}/sign-in?error=link_expired`);
}

await prisma.tenant.update({
  where: { id: tenant.id },
  data: {
    emailFrom: tenant.pendingEmailFrom,
    pendingEmailFrom: null,
    emailVerificationToken: null,
    emailVerificationExpiry: null,
    emailVerificationSentTo: null,
  },
});
```
(`admin/app/api/email-sender/verify/confirm/route.ts:35-53`)

State machine — implicit, no enum exists:

| State | Tenant columns shape |
|---|---|
| Idle | `pendingEmailFrom IS NULL` and `emailVerificationToken IS NULL` |
| Pending | `pendingEmailFrom`, `emailVerificationToken`, `emailVerificationExpiry`, `emailVerificationSentTo` are all set |
| Confirmed | All 4 cleared, `emailFrom = pendingEmailFrom` |
| Cancelled | All 4 cleared, `emailFrom` unchanged (`/api/email-sender/verify/cancel/route.ts:37-39`) |
| Expired | `emailVerificationExpiry < now`; clearing happens lazily on next confirm attempt |

Transition sites:

| Transition | File:line |
|---|---|
| Idle → Pending | `admin/app/api/email-sender/verify/initiate/route.ts:69-77` |
| Pending → Confirmed | `admin/app/api/email-sender/verify/confirm/route.ts:44-53` |
| Pending → Cancelled | `admin/app/api/email-sender/verify/cancel/route.ts:37-39` |
| Pending → Expired | none — checked but not actively cleaned (no cron) |

### Continuous re-verification

**Does not exist.** Neither flow (A or B) is re-polled on a schedule. Verified:

```
$ ls admin/app/api/cron/ | grep -iE 'verif|domain|sender'
(no output)
$ rg -n 'verify' admin/vercel.json
(no output)
```

### "Already connected to another tenant" claim flow with TXT challenge

**Does not exist.** No code handles a domain that is already attached to a
different tenant. Verified:

```
$ rg -n -i 'alreadyConnected|already.connected|alreadyClaimed|claim.*domain|domain.*conflict|reclaim' admin --type ts
(no output)
```

`EmailDomain` has `@@unique([tenantId, domain])` (per-tenant), so two different
tenants can each create rows for the same `domain` string. Resend itself rejects
duplicate domains globally, surfacing the error through `createResendDomain`'s
`throw` — but there is no application-level claim-challenge flow.


## 6. Admin UI for domain management

There is **no** dedicated admin UI for connecting, verifying, or managing
"site domains" (the equivalent of Shopify's `/admin/settings/domains`).
Verified:

```
$ find admin/app -path '*domains*' -o -path '*domain*' 2>/dev/null | grep -v node_modules
admin/app/_lib/email/domains.ts
admin/app/(admin)/settings/email/domain-actions.ts
```

These are the only domain-named files in the app. Both relate to email-sender
domains, not site/storefront domains.

### URL paths

| URL path | File | What the user can do |
|---|---|---|
| `/store` | `admin/app/(admin)/store/page.tsx` | Read-only display of `portalSlug.rutgr.com` and a click-out link to the booking engine. No edit capability. |
| `/settings/organisation` | `admin/app/(admin)/settings/organisation/OrganisationContent.tsx` | Read-only display of `portalSlug.rutgr.com` (line 197-215). |
| `/settings/email` | `admin/app/(admin)/settings/email/EmailContent.tsx` | Email-template editor + sender-email verification (single emailFrom address). Does NOT import `domain-actions.ts`. |

The `domain-actions.ts` server-action module exists but is **not imported by
any admin UI file**. Verified:

```
$ grep -rln 'domain-actions\|EmailDomain\|addEmailDomain\|checkDomainVerification\|removeEmailDomain' admin --include='*.tsx' --include='*.ts'
admin/node_modules/.prisma/client/index.d.ts
admin/node_modules/@clerk/backend/dist/api/resources/InstanceRestrictions.d.ts
admin/node_modules/@clerk/backend/dist/api/endpoints/InstanceApi.d.ts
admin/app/(admin)/settings/email/domain-actions.ts
```

The only matches are the file itself and unrelated `node_modules` files. No
React component renders an "Add domain" form, so the `EmailDomain` table is
currently dead infrastructure from a UI perspective. (See §13 for whether
this is flagged as a TODO.)

### Server actions / form handlers — first 20 lines per signature

`addEmailDomain` (signature + first ~20 lines):
```ts
export async function addEmailDomain(domain: string): Promise<{
  success: boolean;
  error?: string;
  domain?: EmailDomainRecord;
}> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { success: false, error: "Inte inloggad" };

  const normalized = domain.trim().toLowerCase();

  if (!DOMAIN_REGEX.test(normalized)) {
    return { success: false, error: "Ogiltigt domänformat" };
  }

  // Check not already added
  const existing = await prisma.emailDomain.findUnique({
    where: {
      tenantId_domain: {
```
(`admin/app/(admin)/settings/email/domain-actions.ts:48-72`)

`checkDomainVerification` (signature + first ~20 lines):
```ts
export async function checkDomainVerification(domainId: string): Promise<{
  status: "PENDING" | "VERIFIED" | "FAILED";
  verifiedAt?: string;
  error?: string;
}> {
  const guard = await requireAdmin();
  if (!guard.ok) return { status: "PENDING", error: guard.error };

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { status: "PENDING", error: "Inte inloggad" };

  const domain = await prisma.emailDomain.findFirst({
    where: { id: domainId, tenantId: tenantData.tenant.id },
  });
  if (!domain) return { status: "PENDING", error: "Domänen hittades inte" };

  if (!domain.resendDomainId) {
    return { status: "FAILED", error: "Domänen saknar Resend-ID" };
  }

  try {
    const result = await getResendDomainStatus(domain.resendDomainId);
```
(`admin/app/(admin)/settings/email/domain-actions.ts:110-131`)

`removeEmailDomain` (signature + first ~20 lines):
```ts
export async function removeEmailDomain(domainId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  const domain = await prisma.emailDomain.findFirst({
    where: { id: domainId, tenantId: tenantData.tenant.id },
  });
  if (!domain) return { ok: false, error: "Domänen hittades inte" };

  // Delete from Resend (best-effort — domain may already be gone)
  if (domain.resendDomainId) {
    try {
      await deleteResendDomain(domain.resendDomainId);
    } catch (err) {
      console.error("[removeEmailDomain] Resend delete error (non-fatal):", err);
    }
  }
```
(`admin/app/(admin)/settings/email/domain-actions.ts:181-203`)

`getEmailDomain` (signature + first ~20 lines):
```ts
export async function getEmailDomain(): Promise<EmailDomainRecord | null> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;

  const domain = await prisma.emailDomain.findFirst({
    where: { tenantId: tenantData.tenant.id },
  });

  if (!domain) return null;

  return {
    id: domain.id,
    domain: domain.domain,
    status: domain.status as "PENDING" | "VERIFIED" | "FAILED",
    dnsRecords: (domain.dnsRecords as unknown as DnsRecord[]) ?? [],
    verifiedAt: domain.verifiedAt?.toISOString() ?? null,
  };
}
```
(`admin/app/(admin)/settings/email/domain-actions.ts:27-44`)

Sender-email verification has its own (live) HTTP routes:

| Route | File |
|---|---|
| `POST /api/email-sender/verify/initiate` | `admin/app/api/email-sender/verify/initiate/route.ts` |
| `POST /api/email-sender/verify/cancel` | `admin/app/api/email-sender/verify/cancel/route.ts` |
| `GET  /api/email-sender/verify/confirm?token=...` | `admin/app/api/email-sender/verify/confirm/route.ts` |

These verify *email-address ownership*, not domain ownership.

### UI components related to domains

```
$ find admin/app -name '*Domain*.tsx' -o -name '*domain*.tsx'
(no output)
$ rg -ln 'EmailDomain|<DomainCard|<DomainList|<DomainSetup' admin --type tsx
(no output)
```

**Does not exist.** No React component renders domain management UI.

The closest component reference is the read-only display block in
`admin/app/(admin)/settings/organisation/OrganisationContent.tsx:197-215`,
which renders a static link to `{portalSlug}.rutgr.com`.


## 7. Markets, locales, and domain-to-market binding

### Market / Region / Country models

**Does not exist as a model.** Verified:

```
$ rg -n -i 'model\s+(Market|Region|Country|TenantMarket|MarketRegion)\b' admin/prisma/schema.prisma
(no output)
```

The substring `country` appears as plain `String` columns on several models
(`Tenant.addressCountry`, `GuestAccount.country`, `GuestAddress.country`,
`Company` country fields, `RumGeo.country`) but no `Market` or `Region` model
exists. There is no model that binds a domain to a market.

### Locale models

`TenantLocale` (per-tenant published locales) and `TenantTranslation` exist —
already quoted in §1. The platform locale list itself is hardcoded in
`admin/app/_lib/translations/locales.ts` — verbatim:

```ts
export const SUPPORTED_LOCALES = [
  { code: "sv", name: "Svenska", nativeName: "Svenska", flag: "🇸🇪", country: "se", required: true },
  { code: "en", name: "Engelska", nativeName: "English", flag: "🇬🇧", country: "gb", required: false },
  { code: "de", name: "Tyska", nativeName: "Deutsch", flag: "🇩🇪", country: "de", required: false },
  { code: "fr", name: "Franska", nativeName: "Français", flag: "🇫🇷", country: "fr", required: false },
  { code: "es", name: "Spanska", nativeName: "Español", flag: "🇪🇸", country: "es", required: false },
  { code: "it", name: "Italienska", nativeName: "Italiano", flag: "🇮🇹", country: "it", required: false },
  { code: "nl", name: "Nederländska", nativeName: "Nederlands", flag: "🇳🇱", country: "nl", required: false },
  { code: "nb", name: "Norska", nativeName: "Norsk", flag: "🇳🇴", country: "no", required: false },
  { code: "da", name: "Danska", nativeName: "Dansk", flag: "🇩🇰", country: "dk", required: false },
  { code: "fi", name: "Finska", nativeName: "Suomi", flag: "🇫🇮", country: "fi", required: false },
  { code: "pl", name: "Polska", nativeName: "Polski", flag: "🇵🇱", country: "pl", required: false },
  { code: "pt", name: "Portugisiska", nativeName: "Português", flag: "🇵🇹", country: "pt", required: false },
  { code: "ru", name: "Ryska", nativeName: "Русский", flag: "🇷🇺", country: "ru", required: false },
  { code: "ja", name: "Japanska", nativeName: "日本語", flag: "🇯🇵", country: "jp", required: false },
  { code: "zh", name: "Kinesiska", nativeName: "中文", flag: "🇨🇳", country: "cn", required: false },
  { code: "ar", name: "Arabiska", nativeName: "العربية", flag: "🇸🇦", country: "sa", required: false },
  { code: "tr", name: "Turkiska", nativeName: "Türkçe", flag: "🇹🇷", country: "tr", required: false },
  { code: "ko", name: "Koreanska", nativeName: "한국어", flag: "🇰🇷", country: "kr", required: false },
  { code: "cs", name: "Tjeckiska", nativeName: "Čeština", flag: "🇨🇿", country: "cz", required: false },
  { code: "ro", name: "Rumänska", nativeName: "Română", flag: "🇷🇴", country: "ro", required: false },
] as const;

export function getFlagUrl(countryCode: string, size: number = 24): string {
  return `https://flagcdn.com/${size}x${Math.round(size * 0.75)}/${countryCode}.png`;
}

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]["code"];

export const PRIMARY_LOCALE: SupportedLocale = "sv";
```

### Relation between Domain and Market/Locale

**Does not exist.** No `Domain` model exists (see §1), and no model has a
foreign key to a market.

### Subfolder routing by locale

Yes — implemented inside the middleware. Verbatim from
`admin/middleware.ts:121-149`:

```ts
function resolveLocaleFromPath(request: NextRequest): LocaleResolution {
  const pathname = request.nextUrl.pathname;

  // Match /{locale}/p/[token]/... — locale prefix before token-based guest routes
  const tokenMatch = pathname.match(/^\/([a-z]{2})(\/p\/[^/]+.*)$/);
  if (tokenMatch && LOCALE_CODES.has(tokenMatch[1])) {
    const restPath = tokenMatch[2];
    const token = restPath.match(/^\/p\/([^/]+)/)?.[1] ?? null;
    return { locale: tokenMatch[1], token, rewriteUrl: new URL(restPath, request.url) };
  }

  // Match /{locale}/checkout, /{locale}/stays, /{locale}/shop, /{locale}/search, ...
  // Subdomain-based routes — no token needed
  const guestMatch = pathname.match(/^\/([a-z]{2})(\/(checkout|stays|shop|search|account|portal|login|register|order-status)(\/.*)?$)/);
  if (guestMatch && LOCALE_CODES.has(guestMatch[1])) {
    const restPath = guestMatch[2];
    return { locale: guestMatch[1], token: null, rewriteUrl: new URL(restPath, request.url) };
  }

  return { locale: PRIMARY_LOCALE, token: null, rewriteUrl: null };
}
```

The matcher entries that route locale-prefixed paths (from `config.matcher`,
`admin/middleware.ts:486-489`):
```ts
'/:path((?:[a-z]{2})/p/.*)',
'/:path((?:[a-z]{2})/checkout.*)',
'/:path((?:[a-z]{2})/stays.*)',
'/:path((?:[a-z]{2})/shop.*)',
```

The locale prefix is **stripped** via `NextResponse.rewrite(rewriteUrl)`
(line 184), so `/{locale}/stays/...` is internally routed to `/stays/...` with
the `x-tenant-locale` header set.

Locale validation against `TenantLocale.published` is delegated to
`/api/translations/locales/published` (called via `checkLocalePublished`,
`admin/middleware.ts:90-119`). Unpublished locales return 404 via
`new NextResponse('Not Found', { status: 404 })` (line 180).

### Market resolver `(host, pathname) → market context`

**Does not exist.** No code computes a "market" from host or path. Verified:

```
$ rg -n 'getMarket\(|resolveMarket\(|marketContext|MarketContext' admin --type ts
(no output)
```

What exists is a tenant resolver (host → tenant, see §2) plus a locale
resolver (path → locale, quoted above). They are not composed into a single
market context — locale and tenant are passed independently.

### Subdomain-per-locale support

**Does not exist.** Verified:

```
$ rg -n 'localeSubdomain|subdomainLocale|locale.*subdomain' admin --type ts
(no output)
```

The host parsing in §2 only ever extracts the tenant `portalSlug`; it does
not interpret the leftmost label as a locale. Each tenant has one subdomain
(`{portalSlug}.rutgr.com`) and locales live in path prefixes only.

### TLD-per-market support

**Does not exist.** All hosts are under `rutgr.com`. There is no code path
that switches behaviour based on TLD. Verified:

```
$ rg -n -i 'tld|topLevelDomain|\.se\b.*market|\.no\b.*market|\.dk\b.*market' admin --type ts
(no output)
```


## 8. Platform constants and configuration

### Canonical platform CNAME target

**Does not exist as a code constant.** Verified:

```
$ rg -n 'PLATFORM_HOST|CNAME_TARGET|PLATFORM_IP|A_RECORD|cnameTarget' admin --type ts
(no output)
```

Bedfront does NOT operate a CNAME target like Shopify's `shops.myshopify.com`
because tenants do not connect custom domains. All tenant traffic enters via
`*.rutgr.com` directly (a wildcard on Vercel).

### Platform IP / A record

**Does not exist.** Same `rg` as above returns nothing. Vercel manages the
DNS for `*.rutgr.com` and the IP is not referenced anywhere in code.

### Wildcard tenant-identity convention

Bedfront's equivalent of Shopify's `*.myshopify.com` is `*.rutgr.com`. It is
declared:

- **Documentation:** `admin/CLAUDE.md` "URL structure" — `Booking engine: {portalSlug}.rutgr.com (wildcard DNS)`.
- **Next.js allowed origins** (`admin/next.config.ts:28-29`):
  ```ts
  "rutgr.com",
  "*.rutgr.com",
  ```
- **Runtime fallback constants** — see "Hardcoded vs env" table below.

### Where domain strings come from — env vs hardcoded

| Read path | Source | Hardcoded fallback |
|---|---|---|
| `admin/app/(admin)/_lib/tenant/getGuestPortalUrl.ts:37` | `process.env.NEXT_PUBLIC_BASE_DOMAIN` | `"rutgr.com"` |
| `admin/app/(admin)/store/actions.ts:70` | `process.env.NEXT_PUBLIC_BASE_DOMAIN` | `"rutgr.com"` |
| `admin/app/api/webhooks/stripe/route.ts:334` | `process.env.NEXT_PUBLIC_BASE_DOMAIN` | `"rutgr.com"` |
| `admin/app/api/webhooks/stripe/route.ts:754` | `process.env.NEXT_PUBLIC_BASE_DOMAIN` | `"rutgr.com"` |
| `admin/app/api/cron/abandoned-checkout/route.ts:47` | `process.env.NEXT_PUBLIC_BASE_DOMAIN` | `"rutgr.com"` |
| `admin/app/api/cron/post-stay-feedback/route.ts:46` | `process.env.NEXT_PUBLIC_BASE_DOMAIN` | `"rutgr.com"` |
| `admin/app/api/cron/pre-arrival-reminder/route.ts:73` | `process.env.NEXT_PUBLIC_BASE_DOMAIN` | `"rutgr.com"` |
| `admin/app/_lib/orders/process-paid-side-effects.ts:203` | `process.env.NEXT_PUBLIC_BASE_DOMAIN` | `"rutgr.com"` |
| `admin/app/_lib/payments/providers/webhook.ts:221` | `process.env.NEXT_PUBLIC_BASE_DOMAIN` | `"rutgr.com"` |
| `admin/app/_lib/payments/providers/webhook.ts:324` | `process.env.NEXT_PUBLIC_BASE_DOMAIN` | `"rutgr.com"` |
| `admin/app/_lib/guests/consent.ts:76` | `process.env.NEXT_PUBLIC_BASE_DOMAIN` | `"rutgr.com"` |
| `admin/app/_lib/draft-orders/lifecycle.ts:480` | `process.env.NEXT_PUBLIC_BASE_DOMAIN` | `"rutgr.com"` |
| `admin/app/_lib/checkout/types/cart.ts:162` | none — string-literal | `"rutgr.com"` |
| `admin/app/_lib/guest-auth/resolve-tenant.ts:16` | none — `const BASE_DOMAIN = "rutgr.com"` | `"rutgr.com"` |
| `admin/app/_lib/tenant/portal-slug.ts:63, 72, 86` | none — string-literal `rutgr.com` | `"rutgr.com"` |
| `admin/app/_lib/tenant/seo-context.ts:28, 73-74` | none — `const FALLBACK_DOMAIN = "rutgr.com"` | `"rutgr.com"` |
| `admin/app/_lib/integrations/reliability/place-hold-for-order.ts:148` | none — string-literal | `"placeholder.rutgr.com"` |
| `admin/app/_lib/integrations/reliability/alert-operator.ts:75` | none — string-literal | `"PMS Reliability <noreply@rutgr.com>"` |
| `admin/app/_lib/email/send.ts:89-90` | none — comment-documented fallback | `"noreply@rutgr.com"` |
| `admin/app/_lib/draft-orders/holds.ts:295` | none — string-literal | `"placeholder.rutgr.com"` |
| App registry pages (`admin/app/_lib/apps/definitions/*.ts`) | none — string-literal | `"https://rutgr.com/...:` (support/docs URLs) |

`NEXT_PUBLIC_BASE_DOMAIN` is **not** declared in `admin/app/_lib/env.ts` (the
Zod schema). Per CLAUDE.md, NEXT_PUBLIC vars are intentionally not validated
through the Zod layer (they are build-time inlined). The hardcoded `rutgr.com`
literals listed above act as a fallback when the env var is unset.

### Verbatim — `admin/app/_lib/env.ts` (relevant excerpts)

The `env.ts` Zod schema does not contain any host/domain field:

```ts
const envSchema = z.object({
  // Always required — app cannot start without these
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  INTEGRATION_ENCRYPTION_KEY: z.string().min(32, "INTEGRATION_ENCRYPTION_KEY must be at least 32 characters"),
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters"),

  // Service vars — optional at boot, validated on first use via accessor
  RESEND_API_KEY: z.string().optional(),
  UNSUBSCRIBE_SECRET: z.string().optional(),
  …
  /** Portal slug for guest auth testing on localhost (no subdomain routing).
   *  Must NOT be set in production. */
  DEV_GUEST_PORTAL_SLUG: z.string().optional(),
});
```
(`admin/app/_lib/env.ts:22-70`, abbreviated)

The only domain-string-related env vars referenced anywhere are
`NEXT_PUBLIC_BASE_DOMAIN` (read directly via `process.env`) and
`NEXT_PUBLIC_APP_URL` (used by the verification redirect — see §5).

### Verbatim — `admin/app/_lib/tenant/portal-slug.ts`

```ts
import { customAlphabet } from "nanoid";
import { prisma } from "@/app/_lib/db/prisma";

// URL-safe alphabet — no ambiguous characters (0, O, l, 1)
const nanoid = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 6);

export function nameToSlugBase(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[åä]/g, "a")
    .replace(/[ö]/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

export async function generatePortalSlug(tenantName: string): Promise<string> {
  const base = nameToSlugBase(tenantName);

  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = base ? `${base}-${nanoid()}` : `hotel-${nanoid()}`;

    const existing = await prisma.tenant.findUnique({
      where: { portalSlug: slug },
      select: { id: true },
    });

    if (!existing) return slug;
  }

  // Fallback: pure random if all attempts collide
  return `hotel-${nanoid()}${nanoid()}`;
}

export function portalSlugToUrl(slug: string): string {
  return `https://${slug}.rutgr.com`;
}

export function tenantDefaultEmailFrom(portalSlug: string): string {
  return `noreply@${portalSlug}.rutgr.com`;
}

export function tenantFromAddress(
  tenantName: string,
  portalSlug: string | null,
  customEmailFrom?: string | null,
  customEmailFromName?: string | null,
): string {
  const email = customEmailFrom || (portalSlug ? tenantDefaultEmailFrom(portalSlug) : "noreply@rutgr.com");
  const name = customEmailFromName || tenantName;
  return `${name} <${email}>`;
}
```
(`admin/app/_lib/tenant/portal-slug.ts:14-89`)

`portalSlugToUrl`, `tenantDefaultEmailFrom`, and the fallback at
`tenantFromAddress` line 86 (`"noreply@rutgr.com"`) all hardcode the literal
`rutgr.com` — they do NOT consult `NEXT_PUBLIC_BASE_DOMAIN`.

There is **no** `lib/config.ts`, **no** `lib/constants.ts`, **no**
`lib/platform.ts`. Verified:

```
$ find admin -type f \( -name 'platform.ts' -o -name 'constants.ts' \) -path '*/_lib/*'
(none related to platform host)
```

The `admin/app/_lib/color-schemes/constants.ts` file exists but contains color
defaults, not platform host constants.


## 9. Cron jobs / background workers

All crons are declared in `admin/vercel.json`. Quoted verbatim from
`admin/vercel.json:7-37`:

```json
"crons": [
  { "path": "/api/cron/expire-reservations", "schedule": "*/5 * * * *" },
  { "path": "/api/cron/reconcile-payments", "schedule": "*/15 * * * *" },
  { "path": "/api/cron/deliver-gift-cards", "schedule": "*/5 * * * *" },
  { "path": "/api/cron/app-health-checks", "schedule": "*/5 * * * *" },
  { "path": "/api/cron/retry-app-webhooks", "schedule": "*/5 * * * *" },
  { "path": "/api/cron/close-billing-periods", "schedule": "15 0 * * *" },
  { "path": "/api/cron/email-marketing-sync", "schedule": "0 3 * * *" },
  { "path": "/api/cron/retry-emails", "schedule": "*/5 * * * *" },
  { "path": "/api/cron/abandoned-checkout", "schedule": "0 * * * *" },
  { "path": "/api/cron/pre-arrival-reminder", "schedule": "0 8 * * *" },
  { "path": "/api/cron/post-stay-feedback", "schedule": "0 10 * * *" },
  { "path": "/api/cron/cleanup-idempotency-keys", "schedule": "0 * * * *" },
  { "path": "/api/cron/segment-sync", "schedule": "0 3 * * *" },
  { "path": "/api/cron/screenshot-pending", "schedule": "*/5 * * * *" },
  { "path": "/api/cron/rum-aggregate", "schedule": "0 1 * * *" },
  { "path": "/api/cron/sync-discount-statuses", "schedule": "*/15 * * * *" },
  { "path": "/api/cron/aggregate-analytics", "schedule": "*/5 * * * *" },
  { "path": "/api/cron/expire-checkout-sessions", "schedule": "*/15 * * * *" },
  { "path": "/api/cron/automation-enrollments", "schedule": "*/2 * * * *" },
  { "path": "/api/cron/send-campaigns", "schedule": "*/5 * * * *" },
  { "path": "/api/cron/reconcile-pms?tier=hot", "schedule": "*/2 * * * *" },
  { "path": "/api/cron/reconcile-pms?tier=warm", "schedule": "7 * * * *" },
  { "path": "/api/cron/reconcile-pms?tier=cold", "schedule": "23 3 * * *" },
  { "path": "/api/cron/retry-pms-webhooks", "schedule": "*/5 * * * *" },
  { "path": "/api/cron/retry-pms-outbound", "schedule": "*/5 * * * *" },
  { "path": "/api/cron/release-expired-holds", "schedule": "*/5 * * * *" },
  { "path": "/api/cron/release-expired-draft-holds", "schedule": "*/5 * * * *" },
  { "path": "/api/cron/expire-draft-orders", "schedule": "*/10 * * * *" },
  { "path": "/api/cron/shadow-audit-pms", "schedule": "30 2 * * *" },
  { "path": "/api/cron/cleanup-pms-reliability", "schedule": "17 4 * * *" },
  { "path": "/api/cron/expire-cancellations", "schedule": "*/10 * * * *" },
  { "path": "/api/cron/retry-cancellation-saga", "schedule": "*/5 * * * *" },
  { "path": "/api/cron/aggregate-seo-redirect-hits", "schedule": "*/5 * * * *" }
]
```

### Crons that touch domains, SSL, certificates, verification, status sync

**None.** Verified:

```
$ rg -n -i 'domain|ssl|cert|verif|host' admin/vercel.json
(no output)
```

```
$ ls admin/app/api/cron | grep -iE 'domain|ssl|cert|verif|host'
(no output — none of the cron route directory names match)
```

### One-line description per cron route

| Schedule | Path | What it does |
|---|---|---|
| `*/5 * * * *` | `/api/cron/expire-reservations` | Releases expired inventory reservations, booking locks, webhook events (>30d) |
| `*/15 * * * *` | `/api/cron/reconcile-payments` | Heals stuck PENDING payments (alongside `reconcile-stripe`) |
| `*/5 * * * *` | `/api/cron/deliver-gift-cards` | Delivers scheduled gift-card emails |
| `*/5 * * * *` | `/api/cron/app-health-checks` | Probes installed apps' health endpoints |
| `*/5 * * * *` | `/api/cron/retry-app-webhooks` | Retries failed outbound app webhook deliveries |
| `15 0 * * *` | `/api/cron/close-billing-periods` | Closes monthly app-billing periods |
| `0 3 * * *` | `/api/cron/email-marketing-sync` | Syncs guests to Mailchimp / similar |
| `*/5 * * * *` | `/api/cron/retry-emails` | Retries failed transactional emails (5min → 24h ladder) |
| `0 * * * *` | `/api/cron/abandoned-checkout` | Sends abandoned-checkout reminder emails |
| `0 8 * * *` | `/api/cron/pre-arrival-reminder` | Sends pre-arrival emails |
| `0 10 * * *` | `/api/cron/post-stay-feedback` | Sends post-stay survey emails |
| `0 * * * *` | `/api/cron/cleanup-idempotency-keys` | Deletes expired `PmsIdempotencyKey` rows |
| `0 3 * * *` | `/api/cron/segment-sync` | Recomputes guest segment membership |
| `*/5 * * * *` | `/api/cron/screenshot-pending` | Generates pending tenant theme screenshots |
| `0 1 * * *` | `/api/cron/rum-aggregate` | Aggregates daily RUM metrics |
| `*/15 * * * *` | `/api/cron/sync-discount-statuses` | Auto-activates/expires discount rows by date |
| `*/5 * * * *` | `/api/cron/aggregate-analytics` | Aggregates daily analytics events |
| `*/15 * * * *` | `/api/cron/expire-checkout-sessions` | Expires stale Stripe Checkout Sessions |
| `*/2 * * * *` | `/api/cron/automation-enrollments` | Drives email-marketing automation enrollments |
| `*/5 * * * *` | `/api/cron/send-campaigns` | Sends scheduled email campaigns |
| `*/2 * * * *` | `/api/cron/reconcile-pms?tier=hot` | PMS reconciliation hot tier (30-min window) |
| `7 * * * *` | `/api/cron/reconcile-pms?tier=warm` | PMS reconciliation warm tier (24h window) |
| `23 3 * * *` | `/api/cron/reconcile-pms?tier=cold` | PMS reconciliation cold tier (7d window) |
| `*/5 * * * *` | `/api/cron/retry-pms-webhooks` | Drains `PmsWebhookInbox` retries |
| `*/5 * * * *` | `/api/cron/retry-pms-outbound` | Drains `PmsOutboundJob` retries + compensation |
| `*/5 * * * *` | `/api/cron/release-expired-holds` | Releases expired PMS availability holds |
| `*/5 * * * *` | `/api/cron/release-expired-draft-holds` | Releases expired draft-order availability holds |
| `*/10 * * * *` | `/api/cron/expire-draft-orders` | Expires draft orders past their TTL |
| `30 2 * * *` | `/api/cron/shadow-audit-pms` | Nightly read-your-write PMS audit |
| `17 4 * * *` | `/api/cron/cleanup-pms-reliability` | Deletes old reliability rows |
| `*/10 * * * *` | `/api/cron/expire-cancellations` | Expires cancellation requests past their decision window |
| `*/5 * * * *` | `/api/cron/retry-cancellation-saga` | Drives the cancellation saga retry ladder |
| `*/5 * * * *` | `/api/cron/aggregate-seo-redirect-hits` | Drains hourly buckets of `SeoRedirectHit` rows |

The full directory listing of `admin/app/api/cron/` returns 31 cron route
directories (some routes share a path with query params). Compared against
`vercel.json`: `cleanup-idempotency-keys` and `reconcile-stripe` are present
as routes but the route directory listing also includes `reconcile-stripe`
(declared in `vercel.json` as `reconcile-payments` — the names differ between
the route file and the cron declaration, see CLAUDE.md "Cron jobs" subsection
which documents `/api/cron/reconcile-stripe`).

Verified by:
```
$ ls admin/app/api/cron
abandoned-checkout                cleanup-pms-reliability        retry-cancellation-saga
aggregate-analytics               close-billing-periods          retry-emails
aggregate-seo-redirect-hits       deliver-gift-cards             retry-pms-outbound
app-health-checks                 email-marketing-sync           retry-pms-webhooks
automation-enrollments            expire-cancellations           rum-aggregate
cleanup-pms-reliability           expire-checkout-sessions       screenshot-pending
…
```

No cron operates on any `EmailDomain` or domain-related table. No cron polls
Resend, Vercel, or DNS for status changes.


## 10. Tests

### Tests touching domain / host / tenant-resolution / portalSlug logic

Found by:
```
$ find admin -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.spec.ts' \
  | xargs grep -l -i 'domain\|host\|tenant.*resolv\|portalSlug\|EmailDomain'
```

Filter result (excluding files that match only via unrelated terms like
"hostname"-as-DB-host in env tests):

| File | What it covers (one line) |
|---|---|
| `admin/middleware.test.ts` | SEO redirect handler — fast-path filter, host+tenant resolution, 301 serving, caching, hit emission (20 `it()` blocks) |
| `admin/app/_lib/tenant/portal-slug.test.ts` | `nameToSlugBase`, `portalSlugToUrl`, `generatePortalSlug`, `tenantDefaultEmailFrom`, `tenantFromAddress` |
| `admin/app/_lib/tenant/seo-context.test.ts` | `tenantToSeoContext` — builds `primaryDomain` from `portalSlug`, falls back to `rutgr.com` |
| `admin/app/(guest)/page.test.tsx` | Guest homepage `generateMetadata` — noindex stub when tenant resolution fails |
| `admin/app/(guest)/search/page.test.tsx` | Guest search page — uses tenant resolver |
| `admin/app/(guest)/sitemap.xml/route.test.ts` | Sitemap route — 404 when host cannot be resolved to tenant; tenant context passed to aggregator |
| `admin/app/(guest)/sitemap_[shard]/route.test.ts` | Sharded sitemap route — same shape, per-shard |
| `admin/app/(guest)/robots.txt/route.test.ts` | Robots.txt — host-based fallback |
| `admin/app/(guest)/shop/products/[slug]/page.test.tsx` | Product page — host resolver path |
| `admin/app/_lib/seo/resolver.test.ts` | SEO resolver |
| `admin/app/_lib/seo/resolver.integration.test.ts` | SEO resolver integration |
| `admin/app/_lib/seo/preview.test.ts` | SEO preview |
| `admin/app/_lib/seo/paths.test.ts` | SEO redirect path normalisation (`normalizeRedirectPath`) |
| `admin/app/_lib/seo/hreflang.test.ts` | hreflang generation per locale |
| `admin/app/_lib/seo/request-cache.test.ts` | Per-request SEO cache |
| `admin/app/_lib/products/actions.redirects.test.ts` | Product slug-rename → SeoRedirect insertion |
| `admin/app/_lib/products/actions.seo.test.ts` | Product SEO override fields |
| `admin/app/_lib/products/actions.collection-seo.test.ts` | Collection SEO override fields |
| `admin/app/(admin)/accommodation-categories/actions.redirects.test.ts` | Category slug-rename → SeoRedirect insertion |
| `admin/app/(admin)/accommodation-categories/actions.seo.test.ts` | Category SEO override fields |
| `admin/app/(admin)/accommodations/actions.test.ts` | Accommodation actions |
| `admin/app/(admin)/_lib/seo/previewAction.test.ts` | Admin SEO preview action |
| `admin/app/_lib/guest-auth/send-otp.test.ts` | OTP send — uses host-based tenant resolution |

### Dedicated tests for `EmailDomain`, custom-domain attach, or domain verification

**Does not exist.** Verified:

```
$ grep -rln 'EmailDomain\|addEmailDomain\|checkDomainVerification\|removeEmailDomain' admin --include='*.test.ts' --include='*.test.tsx' --include='*.spec.ts'
(no output)
```

No test exercises the `domain-actions.ts` server actions, the
`/api/email-sender/verify/*` HTTP routes, the Resend domains adapter
(`email/domains.ts`), or any "claim domain"/"primary domain"/"DNS instructions"
behaviour.

### Dedicated tests for `resolveTenantFromHost` itself

```
$ grep -rln 'describe.*resolveTenantFromHost\|describe.*"resolveTenantFromHost"' admin
(no output)
```

`resolveTenantFromHost` has no direct unit tests; its behaviour is exercised
indirectly through page-level tests (e.g. sitemap/page tests above) by mocking
the function.

### Middleware test — host-resolution coverage

`admin/middleware.test.ts:109-156` — `describe("handleSeoRedirect — host + tenant resolution", ...)`
covers four cases:
- `it("returns null when request has no Host header", …)`
- `it("returns null when tenant resolution fails", …)`
- `it("returns null when internal fetch throws", …)`
- `it("handles malformed tenant response shape gracefully", …)`

These exercise the host → tenant call to `/api/internal/resolve-tenant-by-host`
but assume the host string itself is well-formed.


## 11. App Store / packaging

### Is the domain system part of core platform code, or installed as an app?

**Core, not an app.** Verified:

```
$ ls admin/app/_lib/apps/definitions
booking-com.ts   email-marketing.ts   expedia.ts        guest-crm.ts   meta-ads.ts          spot-booking.ts
channel-manager.ts   email.ts          google-ads.ts     index.ts       revenue-analytics.ts
mailchimp.ts
```

There is no `domain` or `domains` entry in the app definitions. Domain logic
(`portalSlug`, `EmailDomain`, host resolution) lives directly under
`admin/app/_lib/tenant/`, `admin/app/_lib/email/`, `admin/app/(admin)/_lib/tenant/`,
and `admin/middleware.ts` — i.e. core platform code, not a packaged app.

Verified absence of an apps "domains" feature:
```
$ rg -n -i 'apps.*domain|domain.*app|domain.*install' admin --type ts -g '!*test*'
(no output)
$ ls admin/app/(admin)/apps | grep -iE 'domain'
(no output)
```

The closest app related to `domain` is `email.ts` — but that app encapsulates
the **transactional email engine**, not site-domain management. No app
manifest references `EmailDomain`, `addEmailDomain`, or `Tenant.portalSlug`.

```
$ grep -lE 'domain' admin/app/_lib/apps/definitions/*.ts
(no output — no app definition mentions "domain")
```

The domain-system surface (such as it is) is therefore not gated by an
`AppStatus` enum and not subject to the `TenantApp` install/pause lifecycle.


## 12. Cross-cutting domain references (leakage)

`tenant.portalSlug` (the only de-facto "domain" field on Tenant) is read in
many places to compose absolute URLs for emails, OG tags, OAuth callbacks,
checkout, and analytics. Below is a complete inventory from
`rg -n 'tenant\.portalSlug|tenant\.emailFrom|tenant\.emailDomains' admin --type ts -g '!*test*' -g '!*node_modules*'`
(50 hits). Each row reads or writes a domain-related Tenant field outside the
canonical resolvers.

### Reads / writes of `tenant.portalSlug` (host-string composition)

| File:line | What it does |
|---|---|
| `admin/app/_lib/payments/providers/webhook.ts:223` | Builds `https://${portalSlug}.${baseDomain}` for payment-confirmation redirect |
| `admin/app/_lib/payments/providers/webhook.ts:325` | Builds portal base URL for refund-confirmation email |
| `admin/app/_lib/screenshots/generate.ts:42` | Builds portal URL passed to screenshot service |
| `admin/app/_lib/guests/consent.ts:77` | Builds portal base URL for guest consent email |
| `admin/app/_lib/tenant/seo-context.ts:72-73` | Composes `primaryDomain = {portalSlug}.rutgr.com` for SEO context |
| `admin/app/_lib/checkout/types/cart.ts:162` | Builds `${protocol}://${ctx.tenant.portalSlug}.rutgr.com` for cart return URL |
| `admin/app/_lib/email/sendMarketingEmail.ts:71, 78` | Refuses to send if both `portalSlug` AND `emailFrom` are missing; passes both into `tenantFromAddress()` |
| `admin/app/_lib/email/send.ts:93` | Passes `tenant.portalSlug` (and emailFrom/Name) into `tenantFromAddress()` for transactional email |
| `admin/app/(admin)/store/preferences/actions.ts:127-128` | Builds `primaryDomain` string for store preferences UI |
| `admin/app/(admin)/store/actions.ts:82-83` | Returns `portalSlug` and `portalUrl` to admin store dashboard |
| `admin/app/_lib/orders/process-paid-side-effects.ts:205` | Builds portal base URL for paid-order side effects |
| `admin/app/_lib/magic-link/request.ts:79-80` | Calls `portalSlugToUrl(tenant.portalSlug)` to compose magic-link URL |
| `admin/app/(admin)/_lib/tenant/getGuestPortalUrl.ts:35` | Reads `tenant.portalSlug` to return the full portal URL |
| `admin/app/(guest)/auth/magic/[token]/route.ts:41` | Calls `portalSlugToUrl(tenant.portalSlug)` for magic-link redirect |
| `admin/app/_lib/draft-orders/lifecycle.ts:448, 602` | Reads `tenant.portalSlug` for draft-order URLs (rejects if null) |
| `admin/app/(admin)/_lib/tenant/getCurrentTenant.ts:27` | Passes `tenant.portalSlug` to `setSentryTenantContext` |
| `admin/app/(admin)/settings/email/actions.ts:67` | Returns `tenantData.tenant.portalSlug` to the email-settings page |
| `admin/app/(admin)/settings/organisation/OrganisationContent.tsx:197, 206, 215` | Renders the read-only `{portalSlug}.rutgr.com` link in admin UI |
| `admin/app/(admin)/settings/organisation/actions.ts:123` | Returns `portalSlug` to organisation settings page |
| `admin/app/api/webhooks/stripe/route.ts:336` | Builds `https://${portalSlug}.${baseDomain}` for Stripe success URL |
| `admin/app/api/webhooks/stripe/route.ts:755` | Same — refund flow |
| `admin/app/api/admin/backfill-email-from/route.ts:34` | Calls `tenantDefaultEmailFrom(tenant.portalSlug!)` to backfill emailFrom |
| `admin/app/(admin)/_components/GuestPreview/GuestPreviewFrame.tsx:37` | Comment-only TODO referencing portalSlug |
| `admin/app/(guest)/_lib/tenant/resolveTenantFromHost.ts:28` | Sets Sentry context after host resolution |
| `admin/app/api/checkout/create/route.ts:314` | Builds `https://${portalSlug}.rutgr.com` for Stripe Checkout return URL |
| `admin/app/api/cron/deliver-gift-cards/route.ts:65-66` | Composes portal URL via `portalSlugToUrl(card.tenant.portalSlug)` for gift-card emails |
| `admin/app/api/cron/abandoned-checkout/route.ts:48-49` | Composes portal base for abandoned-checkout reminder email |
| `admin/app/api/cron/pre-arrival-reminder/route.ts:74-75` | Composes portal base for pre-arrival email |
| `admin/app/api/cron/post-stay-feedback/route.ts:47-48` | Composes portal base for post-stay survey email |

### Reads / writes of `tenant.emailFrom`

| File:line | What it does |
|---|---|
| `admin/app/_lib/email/send.ts:94, 95` | Passes `tenant.emailFrom`/`emailFromName` into `tenantFromAddress()` |
| `admin/app/_lib/email/sendMarketingEmail.ts:79, 80` | Same for marketing email |
| `admin/app/(admin)/settings/email/domain-actions.ts:149` | Auto-bootstraps `tenant.emailFrom` to `noreply@{verified-domain}` on first verification |
| `admin/app/(admin)/settings/email/domain-actions.ts:154` | Sets `emailFromName = tenant.emailFromName ?? tenant.name` at the same time |
| `admin/app/(admin)/settings/email/domain-actions.ts:210` | On domain removal, clears `emailFrom` if it pointed at the removed domain |
| `admin/app/api/email-sender/verify/initiate/route.ts:57` | Rejects re-verification if `parsed.emailFrom === tenant.emailFrom` |
| `admin/app/api/email-sender/verify/confirm/route.ts:47` | Activates `pendingEmailFrom → emailFrom` on token confirmation |

### Reads of `tenant.emailDomains` (the relation)

```
$ rg -n 'tenant\.emailDomains|emailDomains:\s*' admin --type ts -g '!*test*'
(no output)
```

The `emailDomains` relation declared on `Tenant` (`schema.prisma:575`) is
**never read via that relation name**. Code that needs domain rows uses
`prisma.emailDomain.find*` directly.

### `customDomain` / `primaryDomain` references

```
$ rg -n 'customDomain' admin --type ts
(no output)
$ rg -n 'primaryDomain' admin --type ts | wc -l
(20 — all are reads/writes of the SEO-context field, not a DB column)
```

`primaryDomain` exists only as a property of the in-memory `SeoTenantContext`
type, populated from `tenant.portalSlug` (or fallback `"rutgr.com"`) in
`admin/app/_lib/tenant/seo-context.ts:72`. It is read by:

- `admin/app/_lib/seo/resolver.ts:300` — `https://${ctx.tenant.primaryDomain}${relative}`
- `admin/app/_lib/seo/paths.ts:39` — `https://${tenant.primaryDomain}${buildLocalePath(...)}`
- `admin/app/_lib/seo/next-metadata.ts:11` — comment referencing the field
- `admin/app/_lib/seo/hreflang.ts:44` — JSDoc reference
- Plus tests in `admin/app/_lib/seo/__tests__/`, `admin/app/_lib/products/queries.test.ts`,
  `admin/app/(guest)/sitemap_[shard]/route.test.ts`, `admin/app/_lib/accommodations/queries.test.ts`,
  `admin/app/(guest)/sitemap.xml/route.test.ts`, `admin/app/_lib/seo/resolver.integration.test.ts`,
  `admin/app/(guest)/_lib/sitemap/route-helpers.test.ts`, `admin/app/_lib/seo/resolver.test.ts`.

### Drift summary

The "domain" concept is leaking into:

- **Stripe / payments** (`webhook.ts`, `process-paid-side-effects.ts`, `checkout/create`)
- **Email** (every transactional and marketing send composes portal URL)
- **Cron jobs** (gift-cards, abandoned-checkout, pre-arrival, post-stay)
- **OAuth/auth callbacks** (magic-link request + magic-link consume routes)
- **Analytics / RUM** (no direct hits in this grep — but RumGeo writes by tenantId, not by domain)
- **SEO** (resolver, paths, hreflang, sitemap, robots, metadata)
- **Admin UI** (organisation, store, store/preferences, email settings)

Each of these sites builds the URL inline rather than calling a single
`getTenantBaseUrl(tenant)` helper. The `(admin)` route group has its own
helper (`admin/app/(admin)/_lib/tenant/getTenantBaseUrl.ts` and
`getGuestPortalUrl.ts`), but most non-admin call sites do their own
template-string composition.


## 13. TODOs, FIXMEs, HACKs

Greps over every file referenced earlier in this audit (resolvers, middleware,
domain-actions, email-sender routes, portal-slug.ts, seo-context.ts, env.ts,
admin store/settings, GuestPreview, internal resolver route):

| File:line | Marker | Comment |
|---|---|---|
| `admin/app/(admin)/_components/GuestPreview/GuestPreviewFrame.tsx:36-38` | informal TODO | `// Share URL uses the app's base URL for now. Once tenant context is // available in PreviewContext, this should use portalSlugToUrl(tenant.portalSlug). // const SHARE_URL = ${process.env.NEXT_PUBLIC_APP_URL || "https://rutgr.com"}/p/test` |
| `admin/app/(admin)/settings/email/EmailContent.tsx:1150` | TODO | `onClick={() => {/* TODO: open staff notifications */}}` (unrelated to domain logic, but in a domain-adjacent file) |
| `admin/app/_lib/tenant/seo-context.test.ts:185` | TODO reference | `// JSDoc (search: "TODO(post-m7)").` — references a TODO in another file (seo-context's `contentUpdatedAt` proxy semantic) |
| `admin/app/_lib/email/client.ts:23` | `@deprecated` | `* @deprecated Use getResendClient() instead. Kept for barrel export compatibility.` |

No TODOs/FIXMEs/HACKs were found inside any of the canonical resolvers
(`resolveTenantFromHost.ts`, `getCurrentTenant.ts`, `resolve-tenant.ts`),
inside `middleware.ts`, inside `domain-actions.ts`, inside `email/domains.ts`,
or inside `email-sender/verify/*`. Verified by running grep across each file
listed above and capturing only the four results shown.


## 14. Summary checklist

Legend: `[x]` exists and looks complete · `[~]` partially exists / has gaps · `[ ]` does not exist.

- [~] **Multiple domains per tenant** — `EmailDomain` schema allows it via `@@unique([tenantId, domain])` and `Tenant.emailDomains` is `EmailDomain[]`, but no admin UI imports `domain-actions.ts` (see §6). Only ONE row is ever read per tenant (`findFirst` in `getEmailDomain`). For the *site/storefront* domain there is exactly one (`portalSlug`).
- [ ] **Primary domain selection (single primary invariant enforced)** — no `isPrimary` column or constraint anywhere.
- [ ] **Secondary domain → primary 301 redirect** — middleware contains no host-to-host redirect logic.
- [x] **Subdomain support (per tenant)** — `Tenant.portalSlug` (unique), wildcard `*.rutgr.com` declared in `next.config.ts:28-29`, host parsed in `resolveTenantFromHost.ts:33-37`.
- [x] **Wildcard tenant-identity domain (myshopify.com equivalent)** — `*.rutgr.com` documented and used; `portalSlugToUrl()` always emits `https://{slug}.rutgr.com`.
- [ ] **Vercel (or other) domains API integration** — no Vercel domains API code.
- [ ] **Automatic SSL provisioning** — no ACME / Let's Encrypt code; relies on Vercel's wildcard cert (no platform code involved).
- [ ] **Automatic SSL renewal** — no renewal code or cron.
- [~] **TXT-based ownership verification (initial)** — exists ONLY for *email-sender domains* via Resend (`createResendDomain` returns DNS records, status read by `getResendDomainStatus`). No TXT verification for site/storefront domains.
- [ ] **Continuous ownership re-verification (cron)** — no cron polls `EmailDomain.status` after the first manual check.
- [~] **Verification status state machine with all transitions covered** — `EmailDomainStatus { PENDING, VERIFIED, FAILED }` exists; only the `PENDING → VERIFIED` and `PENDING → FAILED` transitions are written by `checkDomainVerification`. No re-attempt path, no `FAILED → PENDING` reset, no automated transitions.
- [ ] **"Already connected to another tenant" claim flow with TXT challenge** — no claim-conflict logic.
- [~] **DNS instructions UI shown to user (A / AAAA / CNAME values)** — `EmailDomain.dnsRecords` (JSONB) stores Resend's records and `getEmailDomain()` returns them, but **no React component renders the data** (see §6 — `domain-actions.ts` is unused).
- [ ] **DNS misconfiguration detection (DNSSEC, Cloudflare proxy, restrictive CAA)** — no detection code.
- [ ] **Domain-to-market binding** — no market model exists, no domain-to-market relation.
- [x] **Subfolder locale routing (`/sv-se/...`)** — `resolveLocaleFromPath` in `middleware.ts:121-149`, matcher entries on lines 486-489. (Note: pattern uses 2-letter codes `[a-z]{2}` only, not `sv-se`; matches `/sv/...`, `/en/...`, etc.)
- [ ] **Subdomain-per-locale support** — host parsing only ever extracts portalSlug.
- [ ] **TLD-per-market support** — only `rutgr.com` is referenced anywhere.
- [ ] **Cron-based status sync (DNS, SSL, ownership)** — no cron in `vercel.json` or `app/api/cron/` matches `domain|ssl|cert|verif|host`.
- [~] **Customer-facing pages auto-bound to primary domain (Shopify customer accounts equivalent)** — `(guest)` route group runs only on `{portalSlug}.rutgr.com`, but URLs are composed inline in many places (see §12 leakage table) rather than centrally.
- [~] **Tests covering host resolution** — exist via the SEO-redirect middleware describe block (`middleware.test.ts:109-156`) and indirectly through page tests; no dedicated unit test for `resolveTenantFromHost` / `resolveGuestTenant` themselves.
- [ ] **Tests covering verification flow** — zero tests exercise `domain-actions.ts`, `/api/email-sender/verify/*`, or `EmailDomain` lifecycle.

## Git status at end of audit

```
$ git status
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   .claude/settings.local.json
	modified:   admin/app/_lib/draft-orders/index.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	DOMAIN_AUDIT.md
	admin/app/(admin)/_components/draft-orders/
	admin/app/(admin)/draft-orders/
	admin/app/_lib/draft-orders/badge.ts
```

The only file added by this audit is `DOMAIN_AUDIT.md` (this report). The
modified `.claude/settings.local.json`, the modified
`admin/app/_lib/draft-orders/index.ts`, and the untracked draft-orders
directories/files were already present before the audit started (they relate
to in-progress work happening outside the scope of this read-only audit) and
were NOT touched by the audit.

Audit complete. No code changes made.

---

## Phase 0 completion

Date: 2026-04-25
Branch: `phase-0-url-consolidation` (off `main`).

### Goal

Establish `getTenantUrl()` as the single entry point for building any tenant
URL anywhere in the codebase. After this phase, no file outside of
`getTenantUrl()` itself, env/constants, dev-mode host-checks, and tests
references the literal string `"rutgr.com"` or builds a tenant URL via
template string.

### Diff stats (`git diff main --stat | tail -20`)

```
 admin/app/_lib/platform/constants.test.ts          |  54 ++++++++
 admin/app/_lib/platform/constants.ts               |  28 +++++
 admin/app/_lib/tenant/portal-slug.ts               |  29 +++--
 admin/app/_lib/tenant/seo-context.ts               |  19 ++-
 admin/app/_lib/tenant/tenant-url.test.ts           | 138 +++++++++++++++++++++
 admin/app/_lib/tenant/tenant-url.ts                |  79 ++++++++++++
 admin/app/api/admin/backfill-email-from/route.ts   |   2 +-
 admin/app/api/checkout/create/route.ts             |   6 +-
 admin/app/api/cron/abandoned-checkout/route.ts     |   8 +-
 admin/app/api/cron/deliver-gift-cards/route.ts     |   4 +-
 admin/app/api/cron/post-stay-feedback/route.ts     |   8 +-
 admin/app/api/cron/pre-arrival-reminder/route.ts   |   8 +-
 admin/app/api/guest-auth/register/route.ts         |   5 +-
 admin/app/api/guest-auth/request-otp/route.test.ts |  14 ++-
 admin/app/api/guest-auth/request-otp/route.ts      |   5 +-
 admin/app/api/guest-auth/verify-otp/route.test.ts  |  12 +-
 admin/app/api/guest-auth/verify-otp/route.ts       |   5 +-
 .../api/internal/resolve-tenant-by-host/route.ts   |   4 +-
 admin/app/api/webhooks/stripe/route.ts             |  26 ++--
 45 files changed, 559 insertions(+), 253 deletions(-)
```

### Final leakage greps

```
$ rg -n '"rutgr\.com"' admin --type ts
admin/next.config.ts:28:        "rutgr.com",
admin/app/_lib/platform/constants.test.ts:19:    expect(getPlatformBaseDomain()).toBe("rutgr.com");
admin/app/_lib/platform/constants.ts:6:  * "rutgr.com" applies only to local dev. Production deployments MUST set the
admin/app/_lib/platform/constants.ts:13:const FALLBACK_BASE_DOMAIN = "rutgr.com";
admin/app/_lib/tenant/seo-context.test.ts:142:    expect(ctx.primaryDomain).toBe("rutgr.com");
admin/app/(admin)/store/preferences/actions.test.ts:406:    expect(snap?.primaryDomain).toBe("rutgr.com");
admin/app/api/guest-auth/verify-otp/route.test.ts:148:    }, "rutgr.com"));
admin/app/api/guest-auth/request-otp/route.test.ts:86:    const res = await POST(makeRequest({ email: "guest@example.com" }, "rutgr.com"));
admin/app/api/internal/resolve-tenant-by-host/route.test.ts:144:    // "rutgr.com" with no subdomain — dotIndex > 0 so slug = "rutgr"

$ rg -n "'rutgr\\.com'" admin --type ts
admin/app/_lib/platform/constants.test.ts:17:  it("returns 'rutgr.com' when env unset", () => {

$ rg -n '`[^`]*\.rutgr\.com' admin --type ts
admin/app/(guest)/sitemap_[shard]/route.test.ts:87:  return new Request(`https://apelviken.rutgr.com${path}`);
admin/app/_lib/seo/sitemap/xml.test.ts:111:      `<loc>https://apelviken.rutgr.com/sitemap_accommodations_1.xml</loc>`,
admin/app/_lib/seo/sitemap/xml.test.ts:173:      `<loc>https://apelviken.rutgr.com/sitemap_pages_1.xml?x=1&amp;y=2</loc>`,
admin/app/_lib/seo/sitemap/xml.test.ts:216:      `<loc>https://apelviken.rutgr.com/stays/stuga-bjork</loc>`,
admin/app/_lib/seo/sitemap/xml.test.ts:248:      `<xhtml:link rel="alternate" hreflang="sv" href="https://apelviken.rutgr.com/stays/stuga"/>`,
admin/app/_lib/seo/sitemap/xml.test.ts:251:      `<xhtml:link rel="alternate" hreflang="en" href="https://apelviken.rutgr.com/en/stays/stuga"/>`,
admin/app/_lib/seo/sitemap/xml.test.ts:254:      `<xhtml:link rel="alternate" hreflang="de" href="https://apelviken.rutgr.com/de/stays/stuga"/>`,
admin/app/_lib/seo/sitemap/xml.test.ts:298:      `<loc>https://apelviken.rutgr.com/page?x=a&amp;y=b</loc>`,
admin/app/_lib/seo/sitemap/xml.test.ts:301:      `href="https://apelviken.rutgr.com/en/page?x=a&amp;y=b"`,
admin/app/_lib/tenant/tenant-url.ts:12:  * Direct template-string composition like `https://${slug}.rutgr.com` is

$ rg -n 'https://\$\{[^}]+\}\.rutgr' admin --type ts
admin/app/_lib/tenant/tenant-url.ts:12:  * Direct template-string composition like `https://${slug}.rutgr.com` is

$ rg -n 'process\.env\.NEXT_PUBLIC_BASE_DOMAIN' admin --type ts
admin/app/_lib/platform/constants.ts:16:  return process.env.NEXT_PUBLIC_BASE_DOMAIN || FALLBACK_BASE_DOMAIN;
```

Every remaining hit is in an explicitly allowed location:

- `admin/next.config.ts` — Vercel allowed-origins config.
- `admin/app/_lib/platform/constants.ts` — the source of truth.
- `admin/app/_lib/tenant/tenant-url.ts` — the consumer module (JSDoc only).
- `*.test.ts` / `*.test.tsx` — test fixtures.

Resolver C (`admin/app/_lib/guest-auth/resolve-tenant.ts`) is deleted. All
four call sites now route through Resolver A (`resolveTenantFromHost`).

