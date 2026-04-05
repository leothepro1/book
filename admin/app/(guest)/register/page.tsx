import "../login/login-otp.css";
import { notFound } from "next/navigation";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "../_lib/tenant/resolveTenantFromHost";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { getTenantConfig } from "../_lib/tenant/getTenantConfig";
import { getPageSettings } from "@/app/_lib/pages/config";
import { FONT_CATALOG } from "@/app/_lib/fonts/catalog";
import { googleFontsUrl } from "../_lib/theme/googleFonts";
import { themeToStyleAttr } from "../_lib/theme/applyTheme";
import RegisterForm from "./RegisterForm";

export const dynamic = "force-dynamic";

const SANS_FALLBACK = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";

function fontStack(key: string): string {
  const f = FONT_CATALOG.find((c) => c.key === key);
  if (!f) return SANS_FALLBACK;
  return `${f.label}, ${f.serif ? "ui-serif, Georgia, serif" : SANS_FALLBACK}`;
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Resolve tenant: subdomain in production, DEV_ORG_ID in dev.
  let tenant = await resolveTenantFromHost();
  if (!tenant) {
    try {
      const { orgId } = await getAuth();
      if (orgId) {
        tenant = await prisma.tenant.findUnique({ where: { clerkOrgId: orgId } });
      }
    } catch { /* not authenticated — expected for real guest visits */ }
  }
  if (!tenant) notFound();

  const params = await searchParams;

  // In editor preview (?draft=1), load draft config
  const isDraft = params.draft === "1";
  const config = await getTenantConfig(tenant.id, { preferDraft: isDraft });
  const ps = getPageSettings(config, "login");
  const logoUrl = (ps.logoUrl as string) || null;
  const logoWidth = (ps.logoWidth as number) || 120;

  // Load privacy policy content for the bottom sheet
  const privacyPolicy = await prisma.tenantPolicy.findUnique({
    where: { tenantId_policyId: { tenantId: tenant.id, policyId: "privacy-policy" } },
    select: { content: true },
  });

  // CSS variables — same as login page
  const themeVars = themeToStyleAttr(config.theme);
  const loginStyles: Record<string, string> = {
    "--background": (ps.backgroundColor as string) || "#FFFFFF",
    "--text": (ps.textColor as string) || "#121212",
    "--button-bg": (ps.buttonColor as string) || "#121212",
    "--button-fg": "#FFFFFF",
    "--accent": (ps.accentColor as string) || "#121212",
    "--border-color": (ps.borderColor as string) || "#D7DADE",
    "--field-bg": (ps.fieldStyle as string) === "transparent" ? "transparent" : "#fff",
    "--field-text": (ps.fieldStyle as string) === "transparent" ? (ps.textColor as string) || "#121212" : "#121212",
    "--font-heading": fontStack((ps.headingFont as string) || "inter"),
    "--font-body": fontStack((ps.bodyFont as string) || "inter"),
    "--font-button": fontStack((ps.buttonFont as string) || "inter"),
    "--button-radius": (themeVars as Record<string, string>)["--button-radius"] || "16px",
  };

  // Load Google Fonts for the selected fonts
  const fontKeys = [
    (ps.headingFont as string) || "inter",
    (ps.bodyFont as string) || "inter",
    (ps.buttonFont as string) || "inter",
  ];
  const fontsUrl = googleFontsUrl(fontKeys);

  return (
    <>
      {fontsUrl && (
        <link rel="stylesheet" href={fontsUrl} />
      )}
      <div
        className="otp-login"
        style={loginStyles as React.CSSProperties}
      >
        <RegisterForm
          tenantName={tenant.name}
          logoUrl={logoUrl}
          logoWidth={logoWidth}
          privacyHtml={privacyPolicy?.content ?? null}
        />
      </div>
    </>
  );
}
