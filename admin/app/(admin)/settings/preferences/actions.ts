"use server";

/**
 * Preferences — homepage SEO save + load actions
 * ══════════════════════════════════════════════
 *
 * One pair of server actions backs the Preferences content component:
 *   - `getHomepagePreferences()` — reads current tenant + resolves
 *     the stored `MediaAsset.id` (if any) to a `{ url, publicId }`
 *     pair the admin UI can display and round-trip.
 *   - `saveHomepagePreferences(input)` — validates, resolves the
 *     client-supplied Cloudinary `publicId` to `MediaAsset.id` (the
 *     canonical SEO engine identifier), merges into `seoDefaults`
 *     without clobbering sibling fields, and persists.
 *
 * Security posture:
 *   - requireAdmin before anything.
 *   - Every Prisma query is scoped by `tenantId` — a malicious
 *     merchant who pastes another tenant's MediaAsset publicId can
 *     never persist that id in their own `seoDefaults.homepage`.
 *   - Zod `.safeParse` at the boundary — never `prisma.update` with
 *     raw form data.
 */

import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { prisma } from "@/app/_lib/db/prisma";
import { log } from "@/app/_lib/logger";
import {
  SEO_HOMEPAGE_DESCRIPTION_MAX,
  SEO_HOMEPAGE_TITLE_MAX,
  SeoDefaultsSchema,
  safeParseSeoDefaults,
} from "@/app/_lib/seo/types";

// ── Shared types ─────────────────────────────────────────────

export interface HomepagePreferencesSnapshot {
  readonly title: string;
  readonly description: string;
  /** Display-only, for SerpPreview. */
  readonly siteName: string;
  readonly primaryDomain: string;
  /** Null when no image has been set. */
  readonly ogImage: {
    readonly id: string;
    readonly publicId: string;
    readonly url: string;
  } | null;
}

export type HomepagePreferencesSaveInput = {
  title: string;
  description: string;
  /**
   * Cloudinary publicId returned by `<ImageUpload>`. The server
   * resolves this to `MediaAsset.id` before persisting. `null`
   * means "clear the image". If set but unresolvable, the save
   * is rejected rather than silently dropping the value.
   */
  ogImagePublicId: string | null;
};

export type SaveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

// ── Validation schema ────────────────────────────────────────

/**
 * Validates the form's outbound payload. Narrower than the schema in
 * `seo/types.ts` on purpose — that schema describes JSONB storage,
 * this one describes what the form sends.
 */
const HomepagePreferencesSaveInputSchema = z
  .object({
    title: z
      .string()
      .max(SEO_HOMEPAGE_TITLE_MAX, "Titel är för lång"),
    description: z
      .string()
      .max(SEO_HOMEPAGE_DESCRIPTION_MAX, "Beskrivning är för lång"),
    ogImagePublicId: z.string().nullable(),
  })
  .strict();

// ── Load ─────────────────────────────────────────────────────

export async function getHomepagePreferences(): Promise<HomepagePreferencesSnapshot | null> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;
  const tenant = tenantData.tenant;

  const defaults = safeParseSeoDefaults(tenant.seoDefaults);
  const homepage = defaults.homepage;

  let ogImage: HomepagePreferencesSnapshot["ogImage"] = null;
  if (homepage?.ogImageId) {
    const asset = await prisma.mediaAsset.findFirst({
      where: {
        id: homepage.ogImageId,
        tenantId: tenant.id,
        deletedAt: null,
      },
      select: { id: true, publicId: true, url: true },
    });
    if (asset) {
      ogImage = {
        id: asset.id,
        publicId: asset.publicId,
        url: asset.url,
      };
    }
  }

  const primaryDomain = tenant.portalSlug
    ? `${tenant.portalSlug}.rutgr.com`
    : "rutgr.com";

  return {
    title: homepage?.title ?? "",
    description: homepage?.description ?? "",
    siteName: tenant.name,
    primaryDomain,
    ogImage,
  };
}

// ── Save ─────────────────────────────────────────────────────

export async function saveHomepagePreferences(
  input: HomepagePreferencesSaveInput,
): Promise<SaveResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };
  const tenant = tenantData.tenant;

  const parsed = HomepagePreferencesSaveInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Ogiltig indata" };
  }
  const { title, description, ogImagePublicId } = parsed.data;

  // ── Resolve publicId → MediaAsset.id (tenant-scoped) ──
  //
  // The SEO engine stores MediaAsset.id in seoDefaults.homepage.ogImageId
  // so ImageService.getOgImage(imageId, tenantId) can do a direct PK
  // lookup. ImageUpload returns Cloudinary publicId; we do the
  // conversion here, rejecting unknown publicIds rather than silently
  // dropping the selection (merchant expected their chosen image to
  // persist; silent drop would mislead them).
  let ogImageId: string | undefined;
  if (ogImagePublicId !== null && ogImagePublicId.length > 0) {
    const asset = await prisma.mediaAsset.findFirst({
      where: {
        publicId: ogImagePublicId,
        tenantId: tenant.id,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!asset) {
      log("warn", "seo.preferences.og_image_not_found", {
        tenantId: tenant.id,
        publicId: ogImagePublicId,
      });
      return {
        ok: false,
        error:
          "Den valda bilden kan inte hittas längre. Välj en ny bild och försök igen.",
      };
    }
    ogImageId = asset.id;
  }

  // ── Build homepage subset ──
  // Only include keys when they have a value so absent keys map to
  // Zod `.optional()` fields (whitespace-only title → treat as
  // cleared, per M5 spec decision).
  interface HomepageUpdate {
    title?: string;
    description?: string;
    ogImageId?: string;
    noindex?: boolean;
  }
  const clientFields: HomepageUpdate = {};
  const trimmedTitle = title.trim();
  if (trimmedTitle.length > 0) clientFields.title = trimmedTitle;
  if (description.length > 0) clientFields.description = description;
  if (ogImageId !== undefined) clientFields.ogImageId = ogImageId;

  // Preserve any future homepage fields (e.g., noindex) the client
  // didn't touch this form session. Client-owned fields are:
  // title, description, ogImageId. Everything else on homepage is
  // carried through unchanged.
  const current = safeParseSeoDefaults(tenant.seoDefaults);
  const existing = current.homepage ?? {};
  const mergedHomepage: HomepageUpdate = {
    ...existing,
    // Authoritative for client-owned fields: if absent on this save,
    // the key is cleared.
    title: clientFields.title,
    description: clientFields.description,
    ogImageId: clientFields.ogImageId,
  };

  // ── Merge at the top level — preserve titleTemplate, orgSchema, etc. ──
  const nextDefaults = {
    ...current,
    homepage: mergedHomepage,
  };

  // Round-trip through the schema: catches any drift and applies
  // `.strict()` rejection of stray keys accumulated over time.
  const finalParsed = SeoDefaultsSchema.safeParse(nextDefaults);
  if (!finalParsed.success) {
    log("error", "seo.preferences.merge_invalid", {
      tenantId: tenant.id,
      reason: finalParsed.error.message,
    });
    return { ok: false, error: "Internt fel vid sparning" };
  }

  // Prisma's `InputJsonValue` rejects `undefined` inside objects;
  // Zod's `.optional()` fields infer as `T | undefined` but the
  // parsed output object only contains set keys. Round-trip through
  // JSON to strip any lingering `undefined` and make the type line
  // up. The Zod parse immediately above proves the shape is valid
  // (rule 10 — cast accompanied by boundary parse).
  const jsonSafe = JSON.parse(
    JSON.stringify(finalParsed.data),
  ) as Prisma.InputJsonValue;

  try {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { seoDefaults: jsonSafe },
    });
  } catch (error) {
    log("error", "seo.preferences.save_failed", {
      tenantId: tenant.id,
      reason: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: "Kunde inte spara — försök igen" };
  }

  return { ok: true };
}
