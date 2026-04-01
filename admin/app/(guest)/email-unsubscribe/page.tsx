/**
 * Marketing Email Unsubscribe Page (Guest-facing)
 * ════════════════════════════════════════════════
 *
 * Public page — no auth required. Guests land here from the
 * List-Unsubscribe link in marketing emails (campaigns/automations).
 *
 * Validates HMAC token, upserts EmailSuppression, marks any
 * CampaignRecipient rows as unsubscribed, and shows confirmation.
 *
 * Separate from /(guest)/unsubscribe which handles transactional
 * email unsubscribes via EmailUnsubscribe.
 */

export const dynamic = "force-dynamic";

import { prisma } from "@/app/_lib/db/prisma";
import { verifyUnsubscribeToken } from "@/app/_lib/email/unsubscribe-token";
import { log } from "@/app/_lib/logger";

type Props = {
  searchParams: Promise<{
    tenant?: string;
    email?: string;
    token?: string;
  }>;
};

export default async function EmailUnsubscribePage({ searchParams }: Props) {
  const params = await searchParams;
  const { tenant, email, token } = params;

  // ── Validate params ────────────────────────────────────────
  if (!tenant || !email || !token) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={headingStyle}>Ogiltig länk</h1>
          <p style={textStyle}>
            Avregistreringslänken saknar nödvändiga parametrar.
          </p>
        </div>
      </div>
    );
  }

  // ── Verify HMAC token ──────────────────────────────────────
  if (!verifyUnsubscribeToken(tenant, email, token)) {
    log("warn", "marketing_unsubscribe.invalid_token", {
      tenantId: tenant,
      email,
    });
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={headingStyle}>Ogiltig länk</h1>
          <p style={textStyle}>
            Avregistreringslänken är ogiltig eller har manipulerats.
          </p>
        </div>
      </div>
    );
  }

  const normalizedEmail = email.toLowerCase();

  try {
    // ── 1. Upsert EmailSuppression ─────────────────────────
    await prisma.emailSuppression.upsert({
      where: { tenantId_email: { tenantId: tenant, email: normalizedEmail } },
      update: {},
      create: {
        tenantId: tenant,
        email: normalizedEmail,
        reason: "UNSUBSCRIBE",
      },
    });

    // ── 2. Mark all CampaignRecipients as unsubscribed ─────
    await prisma.campaignRecipient.updateMany({
      where: {
        email: normalizedEmail,
        unsubscribedAt: null,
        campaign: { tenantId: tenant },
      },
      data: { unsubscribedAt: new Date() },
    });

    // ── 3. Resolve tenant name for confirmation ────────────
    const tenantRecord = await prisma.tenant.findUnique({
      where: { id: tenant },
      select: { name: true },
    });
    const tenantName = tenantRecord?.name ?? "detta företag";

    log("info", "marketing_unsubscribe.success", {
      tenantId: tenant,
      email: normalizedEmail,
    });

    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={headingStyle}>Du är avregistrerad</h1>
          <p style={textStyle}>
            Du är avregistrerad från marknadsföringsmail från {tenantName}.
          </p>
        </div>
      </div>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log("error", "marketing_unsubscribe.failed", {
      tenantId: tenant,
      email: normalizedEmail,
      error: message,
    });
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={headingStyle}>Något gick fel</h1>
          <p style={textStyle}>
            Kunde inte avregistrera dig. Försök igen senare.
          </p>
        </div>
      </div>
    );
  }
}

// ── Styles (same pattern as /(guest)/unsubscribe) ──────────────

const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#f6f6f6",
  fontFamily: "Arial, Helvetica, sans-serif",
  padding: 20,
};

const cardStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: 12,
  padding: "40px 32px",
  maxWidth: 460,
  width: "100%",
  textAlign: "center" as const,
};

const headingStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  color: "#1a1a1a",
  marginBottom: 12,
};

const textStyle: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.6,
  color: "#666666",
};
