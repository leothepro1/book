import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { isValidLocale, PRIMARY_LOCALE } from "@/app/_lib/translations/locales";

// ── GET /api/translations/locales ────────────────────────────
// Returns all locales for the authenticated tenant.

export async function GET() {
  try {
    const { orgId } = await getAuth();
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const locales = await prisma.tenantLocale.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ primary: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ locales });
  } catch (err) {
    console.error("[translations/locales GET] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/translations/locales ───────────────────────────
// Add a new locale. Idempotent — if locale already exists, returns it.

export async function POST(request: Request) {
  try {
    const { orgId } = await getAuth();
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const body = await request.json();
    const localeCode = body.locale;

    if (!localeCode || typeof localeCode !== "string" || !isValidLocale(localeCode)) {
      return NextResponse.json({ error: "Ogiltigt språk" }, { status: 400 });
    }

    // Idempotent — return existing if already exists
    const existing = await prisma.tenantLocale.findUnique({
      where: { tenantId_locale: { tenantId: tenant.id, locale: localeCode } },
    });
    if (existing) {
      return NextResponse.json({ locale: existing });
    }

    const isPrimary = localeCode === PRIMARY_LOCALE;
    const locale = await prisma.tenantLocale.create({
      data: {
        tenantId: tenant.id,
        locale: localeCode,
        primary: isPrimary,
        published: isPrimary, // Swedish is always published
      },
    });

    return NextResponse.json({ locale }, { status: 201 });
  } catch (err) {
    console.error("[translations/locales POST] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
