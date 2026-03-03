import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/app/_lib/db/prisma";

export async function GET() {
  try {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
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
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const config = tenant.draftSettings || tenant.settings;

    return NextResponse.json(
      {
        config: config ? { tenantId: tenant.id, ...(config as Record<string, unknown>) } : null,
        hasDraft: !!tenant.draftSettings,
        draftUpdatedAt: tenant.draftUpdatedAt?.toISOString() ?? null,
        draftUpdatedBy: tenant.draftUpdatedBy,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (err) {
    console.error("[draft-config] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
