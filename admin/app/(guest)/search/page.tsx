import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveTenantFromHost } from "../_lib/tenant/resolveTenantFromHost";
import { getTenantConfig } from "../_lib/tenant/getTenantConfig";
import { getRequestLocale } from "../_lib/locale/getRequestLocale";
import { resolveBookingFromToken } from "../_lib/portal/resolveBooking";
import { getBookingStatus } from "../_lib/booking";
import { ThemeRenderer } from "../_lib/themes";
import GuestPageShell from "../_components/GuestPageShell";
import { toNextMetadata } from "@/app/_lib/seo/next-metadata";
import { resolveSeoForRequest } from "@/app/_lib/seo/request-cache";

export const dynamic = "force-dynamic";

// ── SEO metadata ──────────────────────────────────────────────
//
// `/search` is ALWAYS noindex per Google's Quality Guidelines on
// auto-generated search result pages (thin content). The resolved
// ResolvedSeo.noindex is always true because searchSeoAdapter's
// isIndexable returns false — toNextMetadata emits the appropriate
// robots meta.
//
// Not-found tenant returns a noindex stub — never throw from
// generateMetadata (Next would 500 the whole request).
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await resolveTenantFromHost();
  if (!tenant) {
    return { title: "Not found", robots: { index: false } };
  }

  const locale = await getRequestLocale();
  // slug is "" for synthetic resources — search has no Prisma entity.
  const resolved = await resolveSeoForRequest(
    tenant.id,
    "",
    locale,
    "search",
  );
  if (!resolved) {
    return { title: "Not found", robots: { index: false } };
  }

  return toNextMetadata(resolved);
}

/**
 * /stays — public availability search page.
 * Renders via ThemeRenderer with templateKey="stays" — same pipeline
 * as the editor preview. SearchResults locked section handles the
 * search form and results client-side.
 */
export default async function StaysPage() {
  const tenant = await resolveTenantFromHost();
  if (!tenant) return notFound();

  const config = await getTenantConfig(tenant.id, {});

  // ThemeRenderer requires a booking context — use preview mock
  const booking = await resolveBookingFromToken("preview");
  if (!booking) return notFound();

  const bookingStatus = getBookingStatus(booking);

  return (
    <GuestPageShell config={config} pageId="stays">
      <ThemeRenderer
        templateKey="stays"
        config={config}
        booking={booking}
        bookingStatus={bookingStatus}
        token="preview"
      />
    </GuestPageShell>
  );
}
