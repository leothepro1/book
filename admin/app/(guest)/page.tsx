/**
 * Guest Homepage (`/`)
 * ════════════════════
 *
 * Minimal placeholder. The actual homepage design is a separate
 * product milestone — this file exists so the `/` route emits
 * correct SEO metadata via the engine (M5) without blocking on UX.
 *
 * When the real homepage lands, only the `<main>` body below gets
 * replaced; the metadata + structured-data wiring stays as-is.
 */

import type { Metadata } from "next";

import { toNextMetadata } from "@/app/_lib/seo/next-metadata";
import { resolveSeoForRequest } from "@/app/_lib/seo/request-cache";

import { StructuredData } from "./_components/seo/StructuredData";
import { getRequestLocale } from "./_lib/locale/getRequestLocale";
import { resolveTenantFromHost } from "./_lib/tenant/resolveTenantFromHost";

export const dynamic = "force-dynamic";

// ── SEO metadata ──────────────────────────────────────────────

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await resolveTenantFromHost();
  if (!tenant) {
    return { title: "Not found", robots: { index: false } };
  }

  const locale = await getRequestLocale();
  // slug is ignored for the homepage resourceType — we pass "" so
  // the cache key stays a 4-string tuple.
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

// ── Body ──────────────────────────────────────────────────────

export default async function HomePage() {
  const tenant = await resolveTenantFromHost();
  if (!tenant) return null;

  const locale = await getRequestLocale();
  const resolved = await resolveSeoForRequest(
    tenant.id,
    "",
    locale,
    "homepage",
  );

  return (
    <>
      <StructuredData data={resolved?.structuredData ?? []} />
      <main
        style={{
          padding: "64px 24px",
          maxWidth: 720,
          margin: "0 auto",
        }}
      >
        <h1 style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.2 }}>
          Välkommen till {tenant.name}
        </h1>
      </main>
    </>
  );
}
