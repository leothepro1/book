import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SUPPORTED_LOCALES, PRIMARY_LOCALE } from '@/app/_lib/translations/locales';
import { getCachedLocalePublished, setCachedLocalePublished } from '@/app/_lib/translations/locale-cache';

const isPublicRoute = createRouteMatcher([
  '/',
  '/p/(.*)',
  '/check-in(.*)',
  '/check-out(.*)',
  '/preview/(.*)',
  '/api/webhooks/(.*)',
  '/api/admin/(.*)',
  '/api/email-sender/verify/confirm(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/auth/(.*)',
  '/unsubscribe(.*)',
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

  // Match /{locale}/p/[token]/... — locale prefix before all guest routes
  // Also matches /{locale}/check-in, /{locale}/check-out
  const match = pathname.match(/^\/([a-z]{2})(\/p\/[^/]+.*)$/);
  if (!match) {
    return { locale: PRIMARY_LOCALE, token: null, rewriteUrl: null };
  }

  const possibleLocale = match[1];
  const restPath = match[2]; // e.g. /p/abc123/stays

  if (!LOCALE_CODES.has(possibleLocale)) {
    // Not a locale code — could be a route like /home, /editor
    return { locale: PRIMARY_LOCALE, token: null, rewriteUrl: null };
  }

  // Extract token from the rest path for published-state validation
  const tokenMatch = restPath.match(/^\/p\/([^/]+)/);
  const token = tokenMatch?.[1] ?? null;

  // Rewrite URL to strip the locale prefix
  // /de/p/abc123/stays → /p/abc123/stays
  const rewriteUrl = new URL(restPath, request.url);

  return { locale: possibleLocale, token, rewriteUrl };
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

// ── Middleware entry point ────────────────────────────────────

// I dev: skippa Clerk helt — ingen handshake, ingen redirect
const middleware = process.env.NODE_ENV === 'development'
  ? async (request: NextRequest) => {
      return await handleLocale(request);
    }
  : clerkMiddleware(async (auth, request) => {
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
    // API routes (except webhooks — those handle their own auth)
    '/(api(?!/webhooks))(.*)',
    // Guest portal paths — needed for locale detection
    '/p/(.*)',
    '/check-in(.*)',
    '/check-out(.*)',
    // Locale-prefixed guest routes: /{locale}/p/...
    '/:path((?:[a-z]{2})/p/.*)',
  ],
};
