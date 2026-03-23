export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { sendEmailEvent } from "@/app/_lib/email";
import { parseEventType, SAMPLE_VARIABLES } from "../../_lib";

type RouteContext = { params: Promise<{ eventType: string }> };

const IS_DEV = process.env.NODE_ENV === "development";

const bodySchema = z.object({
  variables: z.record(z.string(), z.string()).optional(),
});

// ── POST /api/email-templates/[eventType]/preview ───────────
// Sends a test email to the authenticated admin's email address.

export async function POST(request: Request, context: RouteContext) {
  try {
    const { orgId, userId } = await getAuth();
    if (!orgId || !userId) {
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

    // Parse optional body
    let bodyVars: Record<string, string> = {};
    try {
      const body = await request.json();
      const parsed = bodySchema.safeParse(body);
      if (parsed.success && parsed.data.variables) {
        bodyVars = parsed.data.variables;
      }
    } catch {
      // Empty body is fine — use defaults
    }

    // Resolve admin email
    let adminEmail: string;
    if (IS_DEV) {
      // In dev mode there is no real Clerk user — use a fallback
      adminEmail = "dev@localhost";
    } else {
      const { currentUser } = await import("@clerk/nextjs/server");
      const user = await currentUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const email = user.emailAddresses?.[0]?.emailAddress;
      if (!email) {
        return NextResponse.json(
          { error: "Ingen e-postadress hittades för din användare" },
          { status: 400 },
        );
      }
      adminEmail = email;
    }

    const mergedVariables = { ...SAMPLE_VARIABLES, ...bodyVars };

    await sendEmailEvent(tenant.id, eventType, adminEmail, mergedVariables, {
      testMode: true,
    });

    return NextResponse.json({ sent: true, to: adminEmail });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[email-templates/preview POST] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
