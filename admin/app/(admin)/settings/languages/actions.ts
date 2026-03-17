"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getTenantBaseUrl } from "@/app/(admin)/_lib/tenant/getTenantBaseUrl";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { isValidLocale, PRIMARY_LOCALE, SUPPORTED_LOCALES } from "@/app/_lib/translations/locales";
import { getTenantPrimaryLocale, invalidatePrimaryLocaleCache } from "@/app/_lib/translations/tenant-primary-locale";
import { invalidateLocaleCache } from "@/app/_lib/translations/locale-cache";
import { scanTranslatableStrings } from "@/app/_lib/translations/scanner";
import { ensureSectionsRegistered } from "@/app/_lib/sections/registry";
import { computeDigest } from "@/app/_lib/translations/digest";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import type { StoredTranslation } from "@/app/_lib/translations/types";

// ── Types ──────────────────────────────────────────────────

export type LocaleRecord = {
  id: string;
  locale: string;
  published: boolean;
  primary: boolean;
  createdAt: Date;
};

export type TranslationFieldData = {
  resourceId: string;
  namespace: string;
  sourceValue: string;
  sourceDigest: string;
  translatedValue?: string;
  translationDigest?: string;
  status: "TRANSLATED" | "OUTDATED" | "MISSING";
  fieldLabel: string;
  pageId?: string;
  pageName?: string;
  sectionId?: string;
  sectionName?: string;
};

export type TranslationPanelResponse = {
  fields: TranslationFieldData[];
  stats: { total: number; translated: number; outdated: number; missing: number };
  primaryLocale: string;
  primaryLocaleName: string;
};

// ── getLocales ──────────────────────────────────────────────

export async function getLocales(): Promise<LocaleRecord[]> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  const rows = await prisma.tenantLocale.findMany({
    where: { tenantId: tenantData.tenant.id },
    orderBy: [{ primary: "desc" }, { createdAt: "asc" }],
  });

  return rows.map((r) => ({
    id: r.id,
    locale: r.locale,
    published: r.published,
    primary: r.primary,
    createdAt: r.createdAt,
  }));
}

// ── addLocale ───────────────────────────────────────────────

export async function addLocale(
  localeCode: string,
): Promise<{ ok: boolean; locale?: LocaleRecord; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  if (!isValidLocale(localeCode)) {
    return { ok: false, error: "Ogiltigt språk" };
  }

  // Idempotent
  const existing = await prisma.tenantLocale.findUnique({
    where: { tenantId_locale: { tenantId: tenantData.tenant.id, locale: localeCode } },
  });
  if (existing) {
    return { ok: true, locale: { id: existing.id, locale: existing.locale, published: existing.published, primary: existing.primary, createdAt: existing.createdAt } };
  }

  // First locale added for this tenant becomes primary
  const existingPrimary = await prisma.tenantLocale.findFirst({
    where: { tenantId: tenantData.tenant.id, primary: true },
  });
  const isPrimary = !existingPrimary;

  const row = await prisma.tenantLocale.create({
    data: {
      tenantId: tenantData.tenant.id,
      locale: localeCode,
      primary: isPrimary,
      published: isPrimary, // primary is always published
    },
  });

  return { ok: true, locale: { id: row.id, locale: row.locale, published: row.published, primary: row.primary, createdAt: row.createdAt } };
}

// ── toggleLocalePublished ───────────────────────────────────

export async function toggleLocalePublished(
  localeCode: string,
  published: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  // Primary locale cannot be unpublished
  if (!published) {
    const isPrimary = await prisma.tenantLocale.findFirst({
      where: { tenantId: tenantData.tenant.id, locale: localeCode, primary: true },
    });
    if (isPrimary) {
      return { ok: false, error: "Förvalt språk kan inte avpubliceras" };
    }
  }

  await prisma.tenantLocale.update({
    where: { tenantId_locale: { tenantId: tenantData.tenant.id, locale: localeCode } },
    data: { published },
  });

  return { ok: true };
}

// ── deleteLocale ────────────────────────────────────────────

export async function deleteLocale(
  localeCode: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  // Primary locale cannot be deleted
  const isPrimary = await prisma.tenantLocale.findFirst({
    where: { tenantId: tenantData.tenant.id, locale: localeCode, primary: true },
  });
  if (isPrimary) {
    return { ok: false, error: "Förvalt språk kan inte tas bort" };
  }

  await prisma.$transaction([
    prisma.tenantTranslation.deleteMany({
      where: { tenantId: tenantData.tenant.id, locale: localeCode },
    }),
    prisma.tenantLocale.delete({
      where: { tenantId_locale: { tenantId: tenantData.tenant.id, locale: localeCode } },
    }),
  ]);

  return { ok: true };
}

// ── getTranslationPanel ─────────────────────────────────────

export async function getTranslationPanel(
  localeCode: string,
): Promise<TranslationPanelResponse | null> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;

  const config = (tenantData.tenant.draftSettings ?? tenantData.tenant.settings) as TenantConfig | null;
  if (!config) return null;

  // Resolve tenant's primary locale
  const tenantPrimaryLocale = await getTenantPrimaryLocale(tenantData.tenant.id);
  const primaryLocaleInfo = SUPPORTED_LOCALES.find((l) => l.code === tenantPrimaryLocale);

  // Ensure section/element definitions are loaded before scanning
  await ensureSectionsRegistered();

  const rows = await prisma.tenantTranslation.findMany({
    where: { tenantId: tenantData.tenant.id, locale: localeCode },
  });

  // Build existingMap using draftValue ?? value — translator sees draft state
  const existingMap = new Map<string, StoredTranslation>(
    rows
      .filter((r) => r.draftValue !== "") // exclude pending deletes
      .map((r) => {
        const effectiveValue = r.draftValue ?? r.value;
        const effectiveDigest = r.draftSourceDigest ?? r.sourceDigest;
        return [
          `${r.locale}:${r.resourceId}`,
          { id: r.id, tenantId: r.tenantId, locale: r.locale, resourceId: r.resourceId, namespace: r.namespace, value: effectiveValue, sourceDigest: effectiveDigest, createdAt: r.createdAt, updatedAt: r.updatedAt },
        ];
      }),
  );

  const fields = scanTranslatableStrings(config, existingMap, localeCode);

  return {
    fields: fields.map((f) => ({
      resourceId: f.resourceId,
      namespace: f.namespace,
      sourceValue: f.sourceValue,
      sourceDigest: f.sourceDigest,
      translatedValue: f.translatedValue,
      translationDigest: f.translationDigest,
      status: f.status,
      fieldLabel: f.context.fieldLabel,
      pageId: f.context.pageId,
      pageName: f.context.pageName,
      sectionId: f.context.sectionId,
      sectionName: f.context.sectionName,
    })),
    stats: {
      total: fields.length,
      translated: fields.filter((f) => f.status === "TRANSLATED").length,
      outdated: fields.filter((f) => f.status === "OUTDATED").length,
      missing: fields.filter((f) => f.status === "MISSING").length,
    },
    primaryLocale: tenantPrimaryLocale,
    primaryLocaleName: primaryLocaleInfo?.name ?? tenantPrimaryLocale.toUpperCase(),
  };
}

// ── deleteTranslation ────────────────────────────────────────

export async function deleteTranslation(
  localeCode: string,
  resourceId: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  // Set draftValue = "" as pending delete marker — will be deleted on publish
  // If the row has no published value either, delete it entirely
  const existing = await prisma.tenantTranslation.findUnique({
    where: { tenantId_locale_resourceId: { tenantId: tenantData.tenant.id, locale: localeCode, resourceId } },
    select: { value: true },
  });

  if (!existing || existing.value === "") {
    // No published value — safe to delete outright
    await prisma.tenantTranslation.deleteMany({
      where: { tenantId: tenantData.tenant.id, locale: localeCode, resourceId },
    });
  } else {
    // Has published value — mark for deletion on publish
    await prisma.tenantTranslation.update({
      where: { tenantId_locale_resourceId: { tenantId: tenantData.tenant.id, locale: localeCode, resourceId } },
      data: { draftValue: "", draftSourceDigest: null },
    });
  }

  return { ok: true };
}

// ── saveTranslation ─────────────────────────────────────────

export async function saveTranslation(
  localeCode: string,
  resourceId: string,
  value: string,
  clientSourceDigest: string,
): Promise<{ ok: boolean; error?: string; conflict?: { currentSource: string; serverDigest: string } }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  // Re-scan to get current source digest
  const config = (tenantData.tenant.draftSettings ?? tenantData.tenant.settings) as TenantConfig | null;
  if (!config) return { ok: false, error: "Ingen konfiguration hittades" };

  await ensureSectionsRegistered();
  const fields = scanTranslatableStrings(config, new Map(), localeCode);
  const field = fields.find((f) => f.resourceId === resourceId);

  if (field && field.sourceDigest !== clientSourceDigest) {
    return {
      ok: false,
      error: "Källtexten har ändrats",
      conflict: { currentSource: field.sourceValue, serverDigest: field.sourceDigest },
    };
  }

  const serverDigest = field?.sourceDigest ?? computeDigest(value);
  const namespace = field?.namespace ?? "TENANT";

  // Upsert: write to draftValue/draftSourceDigest — published value unchanged
  await prisma.tenantTranslation.upsert({
    where: {
      tenantId_locale_resourceId: { tenantId: tenantData.tenant.id, locale: localeCode, resourceId },
    },
    update: {
      draftValue: value,
      draftSourceDigest: serverDigest,
    },
    create: {
      tenantId: tenantData.tenant.id,
      locale: localeCode,
      resourceId,
      namespace,
      value: "", // no published value yet — will be set on publish
      sourceDigest: serverDigest,
      draftValue: value,
      draftSourceDigest: serverDigest,
    },
  });

  return { ok: true };
}

// ── hasTranslationDrafts ────────────────────────────────────

export async function hasTranslationDrafts(
  localeCode: string,
): Promise<boolean> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return false;

  const count = await prisma.tenantTranslation.count({
    where: {
      tenantId: tenantData.tenant.id,
      locale: localeCode,
      draftValue: { not: null },
    },
  });

  return count > 0;
}

// ── publishTranslations ─────────────────────────────────────

export async function publishTranslations(
  localeCode: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  const tenantId = tenantData.tenant.id;

  // Delete rows marked for deletion (draftValue = "")
  await prisma.tenantTranslation.deleteMany({
    where: { tenantId, locale: localeCode, draftValue: "" },
  });

  // Copy draftValue → value for remaining drafts
  await prisma.$executeRaw`
    UPDATE "TenantTranslation"
    SET "value" = "draftValue",
        "sourceDigest" = "draftSourceDigest",
        "draftValue" = NULL,
        "draftSourceDigest" = NULL
    WHERE "tenantId" = ${tenantId}
      AND "locale" = ${localeCode}
      AND "draftValue" IS NOT NULL
      AND "draftValue" != ''
  `;

  return { ok: true };
}

// ── setPrimaryLocale ────────────────────────────────────────

export async function setPrimaryLocale(
  localeCode: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  if (!isValidLocale(localeCode)) {
    return { ok: false, error: "Ogiltigt språk" };
  }

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  const tenantId = tenantData.tenant.id;

  // Verify locale exists for this tenant
  const target = await prisma.tenantLocale.findUnique({
    where: { tenantId_locale: { tenantId, locale: localeCode } },
  });
  if (!target) {
    return { ok: false, error: "Språket finns inte för denna tenant" };
  }

  // Discard all unpublished translation drafts — source digests will be
  // invalid after primary locale change (reference language changes)
  await prisma.tenantTranslation.deleteMany({
    where: { tenantId, value: "", draftValue: { not: null } },
  });
  await prisma.tenantTranslation.updateMany({
    where: { tenantId, draftValue: { not: null } },
    data: { draftValue: null, draftSourceDigest: null },
  });

  // Atomic swap: unset old primary + set new primary + ensure published
  await prisma.$transaction([
    prisma.tenantLocale.updateMany({
      where: { tenantId, primary: true },
      data: { primary: false },
    }),
    prisma.tenantLocale.update({
      where: { tenantId_locale: { tenantId, locale: localeCode } },
      data: { primary: true, published: true },
    }),
  ]);

  // Invalidate caches
  invalidatePrimaryLocaleCache(tenantId);
  invalidateLocaleCache(tenantId);

  return { ok: true };
}

// ── getLocalePreviewUrl ──────────────────────────────────────

/**
 * Build the guest-portal URL for a specific locale.
 *
 * Primary locale → /{base}/p/preview
 * Other locales  → /{base}/{locale}/p/preview
 *
 * Uses getTenantBaseUrl() so future custom-domain support
 * propagates automatically.
 */
export async function getLocalePreviewUrl(
  localeCode: string,
): Promise<string | null> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;

  const baseUrl = await getTenantBaseUrl();
  if (!baseUrl) return null;

  const tenantId = tenantData.tenant.id;
  const primaryLocale = await getTenantPrimaryLocale(tenantId);

  // Primary locale has no prefix
  if (localeCode === primaryLocale) {
    return `${baseUrl}/p/preview`;
  }

  return `${baseUrl}/${localeCode}/p/preview`;
}
