export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { isValidLocale, PRIMARY_LOCALE } from "@/app/_lib/translations/locales";
import { scanTranslatableStrings } from "@/app/_lib/translations/scanner";
import { computeDigest } from "@/app/_lib/translations/digest";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import type { StoredTranslation, TranslatableField, TranslationGroup, SectionTranslationGroup } from "@/app/_lib/translations/types";

type RouteContext = { params: Promise<{ locale: string }> };

// ── GET /api/translations/[locale] ───────────────────────────
// Load full translation panel data for a locale.
// Runs scanner against current draft config.

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { orgId } = await getAuth();
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { locale: localeCode } = await context.params;

    if (!isValidLocale(localeCode)) {
      return NextResponse.json({ error: "Ogiltigt språk" }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true, draftSettings: true, settings: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const config = (tenant.draftSettings ?? tenant.settings) as TenantConfig | null;
    if (!config) {
      return NextResponse.json({ error: "No config found" }, { status: 404 });
    }

    // Load existing translations for this locale in one bulk query
    const rows = await prisma.tenantTranslation.findMany({
      where: { tenantId: tenant.id, locale: localeCode },
    });

    const existingMap = new Map<string, StoredTranslation>(
      rows.map((r) => [
        `${r.locale}:${r.resourceId}`,
        {
          id: r.id,
          tenantId: r.tenantId,
          locale: r.locale,
          resourceId: r.resourceId,
          namespace: r.namespace,
          value: r.value,
          sourceDigest: r.sourceDigest,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        },
      ]),
    );

    const fields = scanTranslatableStrings(config, existingMap, localeCode);

    // Group by page → section
    const groups = groupFields(fields);

    // Compute stats
    const stats = {
      total: fields.length,
      translated: fields.filter((f) => f.status === "TRANSLATED").length,
      outdated: fields.filter((f) => f.status === "OUTDATED").length,
      missing: fields.filter((f) => f.status === "MISSING").length,
    };

    // Separate globals — identified by resourceId prefix, not fieldLabel
    const globals = {
      header: fields.filter((f) => f.resourceId.startsWith("tenant:global:header:")),
      footer: fields.filter((f) => f.resourceId.startsWith("tenant:global:footer:")),
    };

    return NextResponse.json({
      locale: localeCode,
      primaryLocale: PRIMARY_LOCALE,
      groups,
      globals,
      stats,
    });
  } catch (err) {
    console.error("[translations GET] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PUT /api/translations/[locale] ───────────────────────────
// Save one or more translations. Bulk upsert with digest conflict detection.

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { orgId } = await getAuth();
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { locale: localeCode } = await context.params;

    if (!isValidLocale(localeCode)) {
      return NextResponse.json({ error: "Ogiltigt språk" }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true, draftSettings: true, settings: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    // Verify locale exists
    const localeRow = await prisma.tenantLocale.findUnique({
      where: { tenantId_locale: { tenantId: tenant.id, locale: localeCode } },
    });
    if (!localeRow) {
      return NextResponse.json({ error: "Språk ej tillagt" }, { status: 404 });
    }

    const body = await request.json();
    const translations: Array<{ resourceId: string; value: string; sourceDigest: string }> =
      body.translations;

    if (!Array.isArray(translations) || translations.length === 0) {
      return NextResponse.json({ error: "Inga översättningar skickade" }, { status: 400 });
    }

    // Validate each entry
    const HEX8 = /^[0-9a-f]{8}$/;
    for (const entry of translations) {
      if (typeof entry.resourceId !== "string" || entry.resourceId.length === 0) {
        return NextResponse.json({ error: "resourceId måste vara en icke-tom sträng" }, { status: 400 });
      }
      if (typeof entry.value !== "string") {
        return NextResponse.json({ error: "value måste vara en sträng" }, { status: 400 });
      }
      if (typeof entry.sourceDigest !== "string" || !HEX8.test(entry.sourceDigest)) {
        return NextResponse.json({ error: "sourceDigest måste vara en 8-teckens hex-sträng" }, { status: 400 });
      }
    }

    // Re-scan current config to get current source digests
    const config = (tenant.draftSettings ?? tenant.settings) as TenantConfig | null;
    if (!config) {
      return NextResponse.json({ error: "No config found" }, { status: 404 });
    }

    const fields = scanTranslatableStrings(config, new Map(), localeCode);
    const currentDigests = new Map<string, string>(
      fields.map((f) => [f.resourceId, f.sourceDigest]),
    );

    // Check for digest conflicts
    const conflicts: Array<{ resourceId: string; clientDigest: string; serverDigest: string; currentSource: string }> = [];
    for (const entry of translations) {
      const serverDigest = currentDigests.get(entry.resourceId);
      if (serverDigest && entry.sourceDigest !== serverDigest) {
        const field = fields.find((f) => f.resourceId === entry.resourceId);
        conflicts.push({
          resourceId: entry.resourceId,
          clientDigest: entry.sourceDigest,
          serverDigest,
          currentSource: field?.sourceValue ?? "",
        });
      }
    }

    if (conflicts.length > 0) {
      return NextResponse.json(
        { error: "Source content has changed since you loaded the translations", conflicts },
        { status: 409 },
      );
    }

    // Bulk save to draftValue/draftSourceDigest — published values unchanged
    const upserts = translations.map((entry) => {
      const field = fields.find((f) => f.resourceId === entry.resourceId);
      const namespace = field?.namespace ?? "TENANT";
      const serverDigestForEntry = currentDigests.get(entry.resourceId) ?? computeDigest(entry.value);

      return prisma.tenantTranslation.upsert({
        where: {
          tenantId_locale_resourceId: {
            tenantId: tenant.id,
            locale: localeCode,
            resourceId: entry.resourceId,
          },
        },
        update: {
          draftValue: entry.value,
          draftSourceDigest: serverDigestForEntry,
        },
        create: {
          tenantId: tenant.id,
          locale: localeCode,
          resourceId: entry.resourceId,
          namespace,
          value: "",
          sourceDigest: serverDigestForEntry,
          draftValue: entry.value,
          draftSourceDigest: serverDigestForEntry,
        },
      });
    });

    await prisma.$transaction(upserts);

    return NextResponse.json({ saved: translations.length });
  } catch (err) {
    console.error("[translations PUT] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── Helpers ──────────────────────────────────────────────────

function groupFields(fields: TranslatableField[]): TranslationGroup[] {
  const pageMap = new Map<string, TranslationGroup>();

  for (const field of fields) {
    const pageId = field.context.pageId;
    if (!pageId) continue; // globals handled separately

    if (!pageMap.has(pageId)) {
      pageMap.set(pageId, {
        pageId,
        pageName: field.context.pageName ?? pageId,
        sections: [],
      });
    }

    const group = pageMap.get(pageId)!;
    const sectionId = field.context.sectionId;
    if (!sectionId) continue;

    let sectionGroup = group.sections.find((s) => s.sectionId === sectionId);
    if (!sectionGroup) {
      sectionGroup = {
        sectionId,
        sectionName: field.context.sectionName ?? sectionId,
        fields: [],
      } satisfies SectionTranslationGroup;
      group.sections.push(sectionGroup);
    }

    sectionGroup.fields.push(field);
  }

  return Array.from(pageMap.values());
}
