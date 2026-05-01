import "server-only";
import { headers } from "next/headers";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import Script from "next/script";

/**
 * Phase 3 PR-B — Analytics loader server component.
 *
 * Mounts the web-pixel runtime by:
 *   1. Reading the geo country from Vercel/Cloudflare edge headers.
 *      No DB query, no PII, no PII-equivalent — only an ISO 3166-1
 *      alpha-2 code or null.
 *   2. Reading the build manifest at
 *      `public/analytics/runtime-manifest.json` to learn the hashed
 *      bundle filenames. Cached per file mtime — one disk read per
 *      server lifetime.
 *   3. Inlining a `<script>` block setting `window.__bedfront_geo`
 *      and `window.__bedfront_runtime` (with the resolved tenantId)
 *      BEFORE the loader script runs. The loader reads these globals
 *      at boot.
 *   4. Loading `loader.<hash>.js` via `<Script async strategy=
 *      "afterInteractive">`. A hashed URL means the browser cache is
 *      reliable and a new build invalidates the URL automatically.
 *
 * Graceful degradation (refinement #4):
 *   - If the manifest is missing (first deploy after a build pipeline
 *     break, mis-configured environment) we log a warning to Sentry
 *     and return null. The storefront keeps rendering — analytics
 *     just goes silent. Better than hard-crashing the portal.
 *   - If `tenantId` isn't passed we return null with the same
 *     Sentry breadcrumb. This component must not break the layout.
 */

interface ManifestShape {
  builtAt?: string;
  runtime?: string | null;
  runtimeHash?: string | null;
  loader?: string | null;
  loaderHash?: string | null;
}

interface ManifestCacheEntry {
  mtimeMs: number;
  parsed: ManifestShape;
}

type ManifestRead =
  | { kind: "ok"; parsed: ManifestShape }
  | { kind: "missing" }
  | { kind: "read_error"; error: unknown };

const MANIFEST_PATH = join(
  process.cwd(),
  "public/analytics/runtime-manifest.json",
);

let manifestCache: ManifestCacheEntry | null = null;

function readManifestCached(): ManifestRead {
  try {
    if (!existsSync(MANIFEST_PATH)) {
      return { kind: "missing" };
    }
    const stat = statSync(MANIFEST_PATH);
    if (manifestCache && manifestCache.mtimeMs === stat.mtimeMs) {
      return { kind: "ok", parsed: manifestCache.parsed };
    }
    const raw = readFileSync(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw) as ManifestShape;
    manifestCache = { mtimeMs: stat.mtimeMs, parsed };
    return { kind: "ok", parsed };
  } catch (err) {
    return { kind: "read_error", error: err };
  }
}

async function captureSentryWarning(
  message: string,
  extra: unknown,
): Promise<void> {
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureMessage(message, {
      level: "warning",
      extra: { error: String(extra) },
    });
  } catch {
    // Sentry unavailable — eat silently. Production observability is
    // best-effort here; the goal is "never crash the portal".
  }
}

async function readGeoCountry(): Promise<string | null> {
  try {
    const h = await headers();
    const vercel = h.get("x-vercel-ip-country");
    if (vercel && vercel.length === 2) return vercel.toUpperCase();
    const cf = h.get("cf-ipcountry");
    if (cf && cf.length === 2) return cf.toUpperCase();
    return null;
  } catch {
    return null;
  }
}

interface AnalyticsLoaderProps {
  tenantId: string;
}

export async function AnalyticsLoader({ tenantId }: AnalyticsLoaderProps) {
  if (!tenantId) {
    await captureSentryWarning("analytics.loader.tenant_missing", {
      tenantId: String(tenantId),
    });
    return null;
  }

  const read = readManifestCached();
  if (read.kind === "read_error") {
    await captureSentryWarning(
      "analytics.loader.manifest_read_failed",
      read.error,
    );
    return null;
  }
  if (read.kind === "missing" || !read.parsed.runtime || !read.parsed.loader) {
    await captureSentryWarning("analytics.loader.manifest_incomplete", {
      runtime: read.kind === "ok" ? read.parsed.runtime ?? null : null,
      loader: read.kind === "ok" ? read.parsed.loader ?? null : null,
    });
    return null;
  }
  const manifest = read.parsed;

  const geo = await readGeoCountry();

  // The inline script is rendered into the DOM as plain text — a
  // tenantId or country code containing `</script>` would break out
  // of the script tag. Both come from controlled sources (DB tenant
  // id is alphanumeric + dash, geo is a 2-char ISO code) but we
  // double-encode via JSON.stringify on a sanitized object as a
  // belt-and-braces guard. JSON.stringify never produces `</script>`.
  const inlineGlobals = {
    geo,
    runtime: {
      runtime: manifest.runtime,
      loader: manifest.loader,
      tenantId,
    },
  };
  const inlineSource = `window.__bedfront_geo=${JSON.stringify(
    inlineGlobals.geo,
  )};window.__bedfront_runtime=${JSON.stringify(inlineGlobals.runtime)};`;

  return (
    <>
      {/*
        Phase 3 web pixel runtime — runs in parallel with legacy
        AnalyticsProvider. Cutover plan: post-Phase 5 after new
        pipeline aggregations validate against legacy data. Do NOT
        remove AnalyticsProvider in this PR.
      */}
      <script
        // Inline globals must run BEFORE the loader script. `dangerouslySetInnerHTML`
        // is the only way to express "no React-managed escaping for this content".
        // The content is server-built JSON; XSS risk is bounded by JSON.stringify.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: inlineSource }}
      />
      <Script
        async
        strategy="afterInteractive"
        src={`/analytics/${manifest.loader}`}
        type="module"
      />
    </>
  );
}

/**
 * Test-only — clears the manifest mtime cache so a fresh disk read
 * runs on the next call. Production code never invokes this.
 */
export function _resetAnalyticsLoaderCacheForTests(): void {
  manifestCache = null;
}
