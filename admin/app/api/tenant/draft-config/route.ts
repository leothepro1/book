export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";

export async function GET() {
  try {
    const { orgId } = await getAuth();

    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
      select: {
        id: true,
        draftSettings: true,
        settings: true,
        draftUpdatedAt: true,
        draftUpdatedBy: true,
        settingsVersion: true,
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const config = tenant.draftSettings || tenant.settings;

    // ETag based on settingsVersion + draftUpdatedAt for conflict detection
    const etag = `"v${tenant.settingsVersion}-${tenant.draftUpdatedAt?.getTime() ?? 0}"`;

    return NextResponse.json(
      {
        config: config ? { tenantId: tenant.id, ...(config as Record<string, unknown>) } : null,
        hasDraft: !!tenant.draftSettings,
        draftUpdatedAt: tenant.draftUpdatedAt?.toISOString() ?? null,
        draftUpdatedBy: tenant.draftUpdatedBy,
        settingsVersion: tenant.settingsVersion,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          ETag: etag,
        },
      },
    );
  } catch (err) {
    console.error("[draft-config] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
