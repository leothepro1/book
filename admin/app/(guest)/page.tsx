/**
 * Guest Homepage (`/`)
 * ════════════════════
 *
 * Storefront root for every tenant subdomain. Renders the merchant-
 * designed home template via ThemeRenderer — exactly the same code
 * path as `/p/test`, just mounted at the bare `/` URL.
 *
 * `/p/test` stays in place (it backs editor preview iframes and other
 * specific surfaces); this route mirrors its behaviour for anonymous
 * visitors landing on the bare domain.
 *
 * M5 SEO wiring layered on top:
 *   - `generateMetadata` resolves homepage SEO via the engine and
 *     emits title / description / OG / hreflang / canonical.
 *   - The page body renders `<StructuredData>` from the same resolver
 *     output before the themed storefront.
 */

import type { Metadata } from "next";

import "./p/[token]/page.css";
import "./_components/cards/cards.css";

import { toNextMetadata } from "../_lib/seo/next-metadata";
import { resolveSeoForRequest } from "../_lib/seo/request-cache";

import { StructuredData } from "./_components/seo/StructuredData";
import GuestPageShell from "./_components/GuestPageShell";
import { getBookingStatus } from "./_lib/booking";
import { getRequestLocale } from "./_lib/locale/getRequestLocale";
import { resolveBookingFromToken } from "./_lib/portal/resolveBooking";
import { getTenantConfig } from "./_lib/tenant";
import { resolveTenantFromHost } from "./_lib/tenant/resolveTenantFromHost";
import { ThemeRenderer } from "./_lib/themes";

export const dynamic = "force-dynamic";

// ── SEO metadata ──────────────────────────────────────────────

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await resolveTenantFromHost();
  if (!tenant) {
    return { title: "Not found", robots: { index: false } };
  }

  const locale = await getRequestLocale();
  // slug is ignored for the homepage resourceType — "" keeps the
  // cache key a 4-string tuple.
  const resolved = await resolveSeoForRequest(
    tenant.id,
    "",
    locale,
    "homepage",
  );
  if (!resolved) {
    return { title: "Not found", robots: { index: false } };
  }

  return toNextMetadata(resolved);
}

// ── Body — same theme rendering as /p/test ───────────────────

export default async function HomePage() {
  // Mirror /p/[token]/page.tsx with token="test": resolve a
  // preview/test booking, load tenant config, render the merchant's
  // home template. This keeps `/` visually identical to `/p/test`
  // without duplicating the render path.
  const token = "test";
  const booking = await resolveBookingFromToken(token);

  if (!booking) {
    return (
      <div style={{ padding: 20, color: "var(--text)" }}>
        Ingen bokning hittades.
      </div>
    );
  }

  const locale = await getRequestLocale();
  const config = await getTenantConfig(booking.tenantId ?? "default", {
    preferDraft: false,
    locale,
  });
  const bookingStatus = getBookingStatus(booking);

  // SEO structured data — resolved from tenant context, rendered
  // inline in the body (Google accepts JSON-LD anywhere).
  const tenant = await resolveTenantFromHost();
  const seoResolved = tenant
    ? await resolveSeoForRequest(tenant.id, "", locale, "homepage")
    : null;

  return (
    <GuestPageShell config={config} pageId="home">
      <StructuredData data={seoResolved?.structuredData ?? []} />
      <ThemeRenderer
        templateKey="home"
        config={config}
        booking={booking}
        bookingStatus={bookingStatus}
        token={token}
      />
    </GuestPageShell>
  );
}
