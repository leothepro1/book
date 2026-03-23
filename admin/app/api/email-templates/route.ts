export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { EMAIL_EVENT_REGISTRY } from "@/app/_lib/email";

// ── GET /api/email-templates ────────────────────────────────
// Returns all 6 event types with current override state for the tenant.

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

    const overrides = await prisma.emailTemplate.findMany({
      where: { tenantId: tenant.id },
    });

    const overrideMap = new Map(
      overrides.map((o) => [o.eventType, o]),
    );

    const templates = EMAIL_EVENT_REGISTRY.map((def) => {
      const override = overrideMap.get(def.type);
      const hasOverride =
        !!override &&
        (
          (override.subject !== null && override.subject.length > 0) ||
          (override.previewText !== null && override.previewText.length > 0) ||
          (override.html !== null && override.html.length > 0)
        );

      return {
        eventType: def.type,
        label: def.label,
        description: def.description,
        variables: def.variables,
        hasOverride,
        override: {
          subject: override?.subject ?? null,
          previewText: override?.previewText ?? null,
          html: override?.html ?? null,
          updatedAt: override?.updatedAt?.toISOString() ?? null,
        },
        defaults: {
          subject: def.defaultSubject,
          previewText: def.defaultPreviewText,
        },
      };
    });

    return NextResponse.json({ templates });
  } catch (err) {
    console.error("[email-templates GET] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
