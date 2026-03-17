import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { getEventDefinition } from "@/app/_lib/email";
import { renderDefaultTemplate } from "@/app/_lib/email/templates";
import { parseEventType, SAMPLE_VARIABLES } from "../_lib";

type RouteContext = { params: Promise<{ eventType: string }> };

// ── GET /api/email-templates/[eventType] ────────────────────
// Returns full detail for one event type including rendered default HTML.

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { orgId } = await getAuth();
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventType: rawEventType } = await context.params;
    const eventType = parseEventType(rawEventType);
    if (!eventType) {
      return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const [override, defaultHtml] = await Promise.all([
      prisma.emailTemplate.findUnique({
        where: { tenantId_eventType: { tenantId: tenant.id, eventType } },
      }),
      renderDefaultTemplate(eventType, SAMPLE_VARIABLES),
    ]);

    const def = getEventDefinition(eventType);

    return NextResponse.json({
      eventType,
      label: def.label,
      description: def.description,
      variables: def.variables,
      override: {
        subject: override?.subject ?? null,
        previewText: override?.previewText ?? null,
        html: override?.html ?? null,
        updatedAt: override?.updatedAt?.toISOString() ?? null,
      },
      defaults: {
        subject: def.defaultSubject,
        previewText: def.defaultPreviewText,
        html: defaultHtml,
      },
      resolved: {
        subject: override?.subject ?? def.defaultSubject,
        previewText: override?.previewText ?? def.defaultPreviewText,
      },
    });
  } catch (err) {
    console.error("[email-templates/[eventType] GET] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PUT /api/email-templates/[eventType] ────────────────────
// Save a tenant override for one event type. Partial update.

const updateSchema = z.object({
  subject: z.string().min(1).max(998).nullable().optional(),
  previewText: z.string().min(1).max(998).nullable().optional(),
  html: z.string().min(1).nullable().optional(),
});

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { orgId } = await getAuth();
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventType: rawEventType } = await context.params;
    const eventType = parseEventType(rawEventType);
    if (!eventType) {
      return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ogiltig data", details: parsed.error.issues },
        { status: 400 },
      );
    }

    // Build update payload — only include fields that were present in the request
    const data: Record<string, string | null> = {};
    if ("subject" in body) data.subject = parsed.data.subject ?? null;
    if ("previewText" in body) data.previewText = parsed.data.previewText ?? null;
    if ("html" in body) data.html = parsed.data.html ?? null;

    const result = await prisma.emailTemplate.upsert({
      where: { tenantId_eventType: { tenantId: tenant.id, eventType } },
      update: data,
      create: {
        tenantId: tenant.id,
        eventType,
        ...data,
      },
    });

    return NextResponse.json({
      eventType: result.eventType,
      subject: result.subject,
      previewText: result.previewText,
      html: result.html,
      updatedAt: result.updatedAt.toISOString(),
    });
  } catch (err) {
    console.error("[email-templates/[eventType] PUT] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE /api/email-templates/[eventType] ─────────────────
// Reset template to platform defaults by deleting the override.

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { orgId } = await getAuth();
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventType: rawEventType } = await context.params;
    const eventType = parseEventType(rawEventType);
    if (!eventType) {
      return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    await prisma.emailTemplate.deleteMany({
      where: { tenantId: tenant.id, eventType },
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[email-templates/[eventType] DELETE] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
