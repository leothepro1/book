"use server";

import { prisma } from "@/app/_lib/db/prisma";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { EMAIL_EVENT_REGISTRY, getEventDefinition } from "@/app/_lib/email";
import { renderDefaultTemplate } from "@/app/_lib/email/templates";
import { sendEmailEvent } from "@/app/_lib/email";
import type { EmailEventType } from "@/app/_lib/email";
import type { EmailBranding } from "@/app/_lib/email/branding";
import { tenantDefaultEmailFrom } from "@/app/_lib/tenant/portal-slug";
import { getPlatformBaseDomain } from "@/app/_lib/platform/constants";

// ── Types ───────────────────────────────────────────────────────

export type EmailTemplateRow = {
  eventType: string;
  label: string;
  description: string;
  variables: string[];
  hasOverride: boolean;
  override: {
    subject: string | null;
    previewText: string | null;
    html: string | null;
    updatedAt: string | null;
  };
  defaults: {
    subject: string;
    previewText: string;
  };
};

export type EmailTemplateDetail = EmailTemplateRow & {
  defaults: {
    subject: string;
    previewText: string;
    html: string;
  };
  resolved: {
    subject: string;
    previewText: string;
  };
};

const SAMPLE_VARIABLES: Record<string, string> = {
  guestName: "Anna Lindgren",
  hotelName: "Grand Hotel Stockholm",
  checkIn: "2025-08-15",
  checkOut: "2025-08-18",
  roomType: "Dubbelrum Deluxe",
  bookingRef: "BK-20250001",
  portalUrl: "https://portal.example.com/p/abc123",
  roomNumber: "412",
  magicLink: "https://portal.example.com/auth/magic/xyz",
  expiresIn: "24 timmar",
  cancellationReason: "Gästen avbokade via portalen",
  supportMessage: "Tack för din förfrågan. Ditt rum är på 4:e våningen.",
  ticketUrl: "https://portal.example.com/support/ticket/99",
};

const VALID_EVENT_TYPES = new Set(EMAIL_EVENT_REGISTRY.map((e) => e.type));

// ── getTenantPortalSlug ──────────────────────────────────────────

export async function getTenantPortalSlug(): Promise<string | null> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;
  return tenantData.tenant.portalSlug ?? null;
}

// ── getTenantSenderInfo ─────────────────────────────────────────

export type TenantSenderInfo = {
  emailFrom: string | null;
  portalSlug: string | null;
  pendingEmailFrom: string | null;
  emailVerificationSentTo: string | null;
  emailVerificationExpiry: string | null;
  /** Computed default — `noreply@{slug}.{baseDomain}` or `noreply@{baseDomain}`. */
  defaultEmailFrom: string;
};

export async function getTenantSenderInfo(): Promise<TenantSenderInfo | null> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;
  const t = tenantData.tenant;
  return {
    emailFrom: t.emailFrom,
    portalSlug: t.portalSlug,
    pendingEmailFrom: t.pendingEmailFrom,
    emailVerificationSentTo: t.emailVerificationSentTo,
    emailVerificationExpiry: t.emailVerificationExpiry?.toISOString() ?? null,
    defaultEmailFrom: t.portalSlug
      ? tenantDefaultEmailFrom(t.portalSlug)
      : `noreply@${getPlatformBaseDomain()}`,
  };
}

// ── getTenantEmailBranding ───────────────────────────────────────

export type TenantEmailBranding = {
  logoUrl: string | null;
  logoWidth: number | null;
  accentColor: string | null;
};

export async function getTenantEmailBranding(): Promise<TenantEmailBranding | null> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;
  return {
    logoUrl: tenantData.tenant.emailLogoUrl,
    logoWidth: tenantData.tenant.emailLogoWidth,
    accentColor: tenantData.tenant.emailAccentColor,
  };
}

// ── renderEmailPreviewWithBranding ──────────────────────────────

export async function renderEmailPreviewWithBranding(
  eventType: string,
  branding: { logoUrl: string | null; logoWidth: number; accentColor: string },
): Promise<string | null> {
  if (!VALID_EVENT_TYPES.has(eventType as EmailEventType)) return null;
  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;

  const emailBranding: EmailBranding = {
    logoUrl: branding.logoUrl,
    logoWidth: branding.logoWidth,
    accentColor: branding.accentColor,
  };

  return renderDefaultTemplate(
    eventType as EmailEventType,
    SAMPLE_VARIABLES,
    emailBranding,
  );
}

// ── getEmailTemplates ───────────────────────────────────────────

export async function getEmailTemplates(): Promise<EmailTemplateRow[]> {
  const tenantData = await getCurrentTenant();
  if (!tenantData) return [];

  const overrides = await prisma.emailTemplate.findMany({
    where: { tenantId: tenantData.tenant.id },
  });

  const overrideMap = new Map(overrides.map((o) => [o.eventType, o]));

  return EMAIL_EVENT_REGISTRY.map((def) => {
    const override = overrideMap.get(def.type);
    const hasOverride =
      !!override &&
      ((override.subject !== null && override.subject.length > 0) ||
        (override.previewText !== null && override.previewText.length > 0) ||
        (override.html !== null && override.html.length > 0));

    return {
      eventType: def.type,
      label: def.label,
      description: def.description,
      variables: [...def.variables],
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
}

// ── getEmailTemplateDetail ──────────────────────────────────────

export async function getEmailTemplateDetail(
  eventType: string,
): Promise<EmailTemplateDetail | null> {
  if (!VALID_EVENT_TYPES.has(eventType as EmailEventType)) return null;

  const tenantData = await getCurrentTenant();
  if (!tenantData) return null;

  const typedEvent = eventType as EmailEventType;

  const emailBranding: EmailBranding = {
    logoUrl: tenantData.tenant.emailLogoUrl,
    logoWidth: tenantData.tenant.emailLogoWidth ?? 120,
    accentColor: tenantData.tenant.emailAccentColor ?? "#1A56DB",
  };

  const [override, defaultHtml] = await Promise.all([
    prisma.emailTemplate.findUnique({
      where: {
        tenantId_eventType: {
          tenantId: tenantData.tenant.id,
          eventType: typedEvent,
        },
      },
    }),
    renderDefaultTemplate(typedEvent, SAMPLE_VARIABLES, emailBranding),
  ]);

  const def = getEventDefinition(typedEvent);

  const hasOverride =
    !!override &&
    ((override.subject !== null && override.subject.length > 0) ||
      (override.previewText !== null && override.previewText.length > 0) ||
      (override.html !== null && override.html.length > 0));

  return {
    eventType: def.type,
    label: def.label,
    description: def.description,
    variables: [...def.variables],
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
      html: defaultHtml,
    },
    resolved: {
      subject: override?.subject ?? def.defaultSubject,
      previewText: override?.previewText ?? def.defaultPreviewText,
    },
  };
}

// ── saveEmailTemplate ───────────────────────────────────────────

export async function saveEmailTemplate(
  eventType: string,
  data: {
    subject?: string | null;
    previewText?: string | null;
    html?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  if (!VALID_EVENT_TYPES.has(eventType as EmailEventType)) {
    return { ok: false, error: "Ogiltig händelsetyp" };
  }

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  const typedEvent = eventType as EmailEventType;

  try {
    const updateData: Record<string, string | null> = {};
    if ("subject" in data) updateData.subject = data.subject ?? null;
    if ("previewText" in data) updateData.previewText = data.previewText ?? null;
    if ("html" in data) updateData.html = data.html ?? null;

    await prisma.emailTemplate.upsert({
      where: {
        tenantId_eventType: {
          tenantId: tenantData.tenant.id,
          eventType: typedEvent,
        },
      },
      update: updateData,
      create: {
        tenantId: tenantData.tenant.id,
        eventType: typedEvent,
        ...updateData,
      },
    });

    return { ok: true };
  } catch (error) {
    console.error("[saveEmailTemplate] Error:", error);
    return { ok: false, error: "Kunde inte spara mallen — försök igen" };
  }
}

// ── resetEmailTemplate ──────────────────────────────────────────

export async function resetEmailTemplate(
  eventType: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  if (!VALID_EVENT_TYPES.has(eventType as EmailEventType)) {
    return { ok: false, error: "Ogiltig händelsetyp" };
  }

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  const typedEvent = eventType as EmailEventType;

  try {
    await prisma.emailTemplate.deleteMany({
      where: { tenantId: tenantData.tenant.id, eventType: typedEvent },
    });
    return { ok: true };
  } catch (error) {
    console.error("[resetEmailTemplate] Error:", error);
    return { ok: false, error: "Kunde inte återställa mallen — försök igen" };
  }
}

// ── getAdminEmail ───────────────────────────────────────────────

export async function getAdminEmail(): Promise<string | null> {
  const IS_DEV = process.env.NODE_ENV === "development";
  if (IS_DEV) return "dev@localhost";
  try {
    const { currentUser } = await import("@clerk/nextjs/server");
    const user = await currentUser();
    return user?.emailAddresses?.[0]?.emailAddress ?? null;
  } catch {
    return null;
  }
}

// ── sendTestEmail ───────────────────────────────────────────────

export async function sendTestEmail(
  eventType: string,
): Promise<{ ok: boolean; to?: string; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  if (!VALID_EVENT_TYPES.has(eventType as EmailEventType)) {
    return { ok: false, error: "Ogiltig händelsetyp" };
  }

  const tenantData = await getCurrentTenant();
  if (!tenantData) return { ok: false, error: "Inte inloggad" };

  const IS_DEV = process.env.NODE_ENV === "development";
  let adminEmail: string;

  if (IS_DEV) {
    adminEmail = "dev@localhost";
  } else {
    try {
      const { currentUser } = await import("@clerk/nextjs/server");
      const user = await currentUser();
      if (!user) return { ok: false, error: "Inte inloggad" };
      const email = user.emailAddresses?.[0]?.emailAddress;
      if (!email) return { ok: false, error: "Ingen e-postadress hittades" };
      adminEmail = email;
    } catch {
      return { ok: false, error: "Kunde inte hämta din e-postadress" };
    }
  }

  try {
    await sendEmailEvent(
      tenantData.tenant.id,
      eventType as EmailEventType,
      adminEmail,
      SAMPLE_VARIABLES,
      { testMode: true },
    );
    return { ok: true, to: adminEmail };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Okänt fel";
    console.error("[sendTestEmail] Error:", message);
    return { ok: false, error: `Kunde inte skicka: ${message}` };
  }
}

// ── Email event enabled/disabled settings ──────────────────────

export async function getEmailSettings(): Promise<Record<string, boolean>> {
  const ctx = await getCurrentTenant();
  if (!ctx) return {};

  const rows = await prisma.emailTemplate.findMany({
    where: { tenantId: ctx.tenant.id },
    select: { eventType: true, enabled: true },
  });

  const map: Record<string, boolean> = {};
  for (const def of EMAIL_EVENT_REGISTRY) {
    map[def.type] = true; // default enabled
  }
  for (const row of rows) {
    map[row.eventType] = row.enabled;
  }
  return map;
}

export async function toggleEmailEvent(
  eventType: string,
  enabled: boolean,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getCurrentTenant();
  if (!ctx) return { success: false, error: "Inte inloggad" };

  const def = EMAIL_EVENT_REGISTRY.find((e) => e.type === eventType);
  if (!def) return { success: false, error: "Okänd händelsetyp" };
  if (!def.canDisable) return { success: false, error: "Kan inte inaktiveras" };

  await prisma.emailTemplate.upsert({
    where: { tenantId_eventType: { tenantId: ctx.tenant.id, eventType: eventType as EmailEventType } },
    create: { tenantId: ctx.tenant.id, eventType: eventType as EmailEventType, enabled },
    update: { enabled },
  });

  return { success: true };
}
