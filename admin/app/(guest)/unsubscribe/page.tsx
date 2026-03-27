/**
 * Unsubscribe Page (Guest-facing)
 * ════════════════════════════════
 *
 * Public page — no auth required. Guests land here from the
 * List-Unsubscribe link in their email.
 *
 * The GET request itself performs the unsubscribe (one-click pattern
 * matching Gmail's List-Unsubscribe-Post behavior).
 */

export const dynamic = "force-dynamic";

import { prisma } from "@/app/_lib/db/prisma";
import { verifyUnsubscribeToken } from "@/app/_lib/email/unsubscribe-token";

type Props = {
  searchParams: Promise<{
    tenant?: string;
    email?: string;
    token?: string;
  }>;
};

export default async function UnsubscribePage({ searchParams }: Props) {
  const params = await searchParams;
  const { tenant, email, token } = params;

  // Validate all params present
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

  // Verify HMAC token
  if (!verifyUnsubscribeToken(tenant, email, token)) {
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

  // Upsert unsubscribe record — idempotent
  await prisma.emailUnsubscribe.upsert({
    where: { tenantId_email: { tenantId: tenant, email } },
    update: {},
    create: { tenantId: tenant, email },
  });

  // Sync to GuestAccount if one exists for this email
  const guest = await prisma.guestAccount.findUnique({
    where: { tenantId_email: { tenantId: tenant, email } },
    select: { id: true },
  });
  if (guest) {
    const { updateEmailConsent } = await import("@/app/_lib/guests/consent");
    await updateEmailConsent(tenant, guest.id, "UNSUBSCRIBED", {
      source: "email_link",
    }).catch(() => {});
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={headingStyle}>Du är nu avregistrerad</h1>
        <p style={textStyle}>
          Du kommer inte längre att få e-post från detta hotell via vår
          plattform.
        </p>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────

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
  textAlign: "center",
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
