export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { isValidLocale, PRIMARY_LOCALE } from "@/app/_lib/translations/locales";
import { invalidateLocaleCache } from "@/app/_lib/translations/locale-cache";

type RouteContext = { params: Promise<{ locale: string }> };

// ── PATCH /api/translations/locales/[locale] ─────────────────
// Publish or unpublish a locale.

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { orgId } = await getAuth();
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { locale: localeCode } = await context.params;

    if (!isValidLocale(localeCode)) {
      return NextResponse.json({ error: "Ogiltigt språk" }, { status: 400 });
    }

    // Swedish cannot be unpublished
    const body = await request.json();
    if (localeCode === PRIMARY_LOCALE && body.published === false) {
      return NextResponse.json(
        { error: "Svenska kan inte avpubliceras — det är plattformens primärspråk" },
        { status: 400 },
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const existing = await prisma.tenantLocale.findUnique({
      where: { tenantId_locale: { tenantId: tenant.id, locale: localeCode } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Språk ej tillagt" }, { status: 404 });
    }

    const updated = await prisma.tenantLocale.update({
      where: { tenantId_locale: { tenantId: tenant.id, locale: localeCode } },
      data: { published: body.published },
    });

    // Invalidate locale cache so middleware picks up the change immediately
    invalidateLocaleCache(tenant.id, localeCode);

    return NextResponse.json({ locale: updated });
  } catch (err) {
    console.error("[translations/locales PATCH] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE /api/translations/locales/[locale] ────────────────
// Remove a locale and ALL its translations atomically.

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { orgId } = await getAuth();
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { locale: localeCode } = await context.params;

    if (!isValidLocale(localeCode)) {
      return NextResponse.json({ error: "Ogiltigt språk" }, { status: 400 });
    }

    // Swedish cannot be deleted
    if (localeCode === PRIMARY_LOCALE) {
      return NextResponse.json(
        { error: "Svenska kan inte tas bort — det är plattformens primärspråk" },
        { status: 400 },
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const existing = await prisma.tenantLocale.findUnique({
      where: { tenantId_locale: { tenantId: tenant.id, locale: localeCode } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Språk ej tillagt" }, { status: 404 });
    }

    // Atomic: delete translations + locale in a single transaction
    await prisma.$transaction([
      prisma.tenantTranslation.deleteMany({
        where: { tenantId: tenant.id, locale: localeCode },
      }),
      prisma.tenantLocale.delete({
        where: { tenantId_locale: { tenantId: tenant.id, locale: localeCode } },
      }),
    ]);

    // Invalidate locale cache
    invalidateLocaleCache(tenant.id, localeCode);

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[translations/locales DELETE] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
