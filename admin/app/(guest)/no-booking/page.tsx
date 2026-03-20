import "../login/login-otp.css";
import { notFound } from "next/navigation";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveGuestTenantFromHeaders } from "@/app/_lib/guest-auth/resolve-tenant";
import { getTenantConfig } from "../_lib/tenant/getTenantConfig";
import { DEFAULT_TOKENS } from "@/app/_lib/color-schemes/constants";

export const dynamic = "force-dynamic";

export default async function NoBookingPage() {
  const tenantId = await resolveGuestTenantFromHeaders();
  if (!tenantId) notFound();

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  if (!tenant) notFound();

  const config = await getTenantConfig(tenantId);
  const primaryScheme = config.colorSchemes?.[0];
  const tokens = primaryScheme?.tokens ?? DEFAULT_TOKENS;

  return (
    <div
      className="otp-login"
      style={{
        "--login-bg": tokens.background,
        "--login-text": tokens.text,
        "--login-btn-bg": tokens.solidButtonBackground,
        "--login-btn-label": tokens.solidButtonLabel,
        "--login-surface": "#ffffff",
        "--login-page-bg": "#fafafa",
        "--login-border": "#ddd",
        "--login-text-secondary": "#666",
        "--login-error": "#dc2626",
      } as React.CSSProperties}
    >
      <div className="otp-login__card">
        <h1 className="otp-login__title">{tenant.name}</h1>
        <p className="otp-login__subtitle">
          Vi hittar ingen aktiv bokning kopplad till ditt konto.
          Kontakta hotellet om du tror att detta är fel.
        </p>
      </div>
    </div>
  );
}
