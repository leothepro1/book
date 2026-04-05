/**
 * PATCH /api/guest-auth/profile
 *
 * Updates the authenticated guest's profile fields.
 * Session is validated via iron-session — guestAccountId comes from
 * the session, NEVER from the request body.
 *
 * Logs an ACCOUNT_UPDATED event on the guest timeline with a diff
 * of changed fields (old → new) so admin can see exactly what changed.
 * Rate limited: 20 updates per 10 minutes per IP.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/_lib/db/prisma";
import { getGuestSession } from "@/app/_lib/magic-link/session";
import { createGuestAccountEvent } from "@/app/_lib/guests/events";
import { checkRateLimit } from "@/app/_lib/rate-limit/checkout";
import { log } from "@/app/_lib/logger";

export const dynamic = "force-dynamic";

const FIELD_LABELS: Record<string, string> = {
  firstName: "Förnamn",
  lastName: "Efternamn",
  phone: "Telefon",
  address1: "Adress",
  address2: "Adress 2",
  city: "Ort",
  postalCode: "Postnummer",
  country: "Land",
  emailMarketingState: "E-postmarknadsföring",
};

const profileSchema = z.object({
  firstName: z.string().max(200).optional(),
  lastName: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  address1: z.string().max(200).optional(),
  address2: z.string().max(200).optional(),
  city: z.string().max(200).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().length(2).optional(),
  emailMarketingState: z.enum(["SUBSCRIBED", "NOT_SUBSCRIBED"]).optional(),
});

export async function PATCH(req: Request) {
  const session = await getGuestSession();

  if (!session?.guestAccountId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Rate limit: 20 profile updates per 10 minutes
  const allowed = await checkRateLimit("guest-profile", 20, 10 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = profileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Build update payload — only include provided fields
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      data[key] = value;
    }
  }

  // Marketing consent: set timestamp and source when changing state
  if (parsed.data.emailMarketingState) {
    if (parsed.data.emailMarketingState === "SUBSCRIBED") {
      data.emailConsentedAt = new Date();
      data.emailConsentSource = "portal";
    }
  }

  // Sync legacy `name` field when first/last name changes
  if (parsed.data.firstName !== undefined || parsed.data.lastName !== undefined) {
    const fn = (parsed.data.firstName ?? "").trim();
    const ln = (parsed.data.lastName ?? "").trim();
    const fullName = [fn, ln].filter(Boolean).join(" ");
    data.name = fullName || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  // Load current values to compute diff for the timeline event
  const before = await prisma.guestAccount.findUnique({
    where: { id: session.guestAccountId },
    select: {
      tenantId: true,
      firstName: true,
      lastName: true,
      phone: true,
      address1: true,
      address2: true,
      city: true,
      postalCode: true,
      country: true,
      emailMarketingState: true,
    },
  });

  if (!before) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const updated = await prisma.guestAccount.update({
    where: { id: session.guestAccountId },
    data,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      name: true,
      phone: true,
      address1: true,
      address2: true,
      city: true,
      postalCode: true,
      country: true,
      emailMarketingState: true,
    },
  });

  // Build diff: only user-facing fields that actually changed
  const changes: Record<string, { from: string | null; to: string }> = {};
  const DIFF_SKIP = new Set(["emailConsentedAt", "emailConsentSource", "name"]);
  for (const [key, newValue] of Object.entries(data)) {
    if (newValue === undefined || DIFF_SKIP.has(key)) continue;
    const oldValue = (before as Record<string, string | null>)[key] ?? null;
    const newStr = String(newValue);
    if (oldValue !== newStr) {
      changes[key] = { from: oldValue, to: newStr };
    }
  }

  // Log timeline event if anything actually changed
  if (Object.keys(changes).length > 0) {
    const changedLabels = Object.keys(changes)
      .map((k) => FIELD_LABELS[k] ?? k)
      .join(", ");

    try {
      await createGuestAccountEvent({
        guestAccountId: session.guestAccountId,
        tenantId: before.tenantId,
        type: "ACCOUNT_UPDATED",
        message: `Gäst uppdaterade: ${changedLabels}`,
        metadata: { changes, source: "portal" },
      });
    } catch (err) {
      // Never fail the profile update because of event logging
      log("error", "guest-profile.event_failed", {
        guestAccountId: session.guestAccountId,
        error: String(err),
      });
    }
  }

  log("info", "guest-profile.updated", {
    guestAccountId: session.guestAccountId,
    tenantId: before.tenantId,
    fieldsChanged: Object.keys(changes).join(", "),
  });

  return NextResponse.json({ ok: true, account: updated });
}
