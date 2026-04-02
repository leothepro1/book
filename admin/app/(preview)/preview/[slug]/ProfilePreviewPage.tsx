import { prisma } from "@/app/_lib/db/prisma";
import { getTenantConfig } from "@/app/(guest)/_lib/tenant/getTenantConfig";
import { getPageSettings } from "@/app/_lib/pages/config";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { FONT_CATALOG } from "@/app/_lib/fonts/catalog";
import { googleFontsUrl } from "@/app/(guest)/_lib/theme/googleFonts";
import GuestPageShell from "@/app/(guest)/_components/GuestPageShell";
import AccountClient from "@/app/(guest)/account/AccountClient";
import "@/app/(guest)/login/login-otp.css";
import "@/app/(guest)/account/account.css";

const SANS_FALLBACK = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";

function fontStack(key: string): string {
  const f = FONT_CATALOG.find((c) => c.key === key);
  if (!f) return SANS_FALLBACK;
  return `${f.label}, ${f.serif ? "ui-serif, Georgia, serif" : SANS_FALLBACK}`;
}

/**
 * Profile page preview for the editor.
 *
 * Renders the account page (AccountClient) with mock guest data
 * and page settings as CSS variables — same pattern as login/checkout.
 * Follows the same draft/publish pipeline as all other pages.
 */
export async function ProfilePreviewPage() {
  let tenant = null;

  try {
    const { userId, orgId } = await getAuth();
    if (userId && orgId) {
      tenant = await prisma.tenant.findUnique({
        where: { clerkOrgId: orgId },
      });
    }
  } catch { /* Auth failed */ }

  if (!tenant) {
    tenant = await prisma.tenant.findFirst();
  }

  if (!tenant) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#666" }}>
        Ingen tenant hittades.
      </div>
    );
  }

  const config = await getTenantConfig(tenant.id, { preferDraft: true });
  const ps = getPageSettings(config, "profile");

  // CSS variables — same mapping as login/checkout pages
  const pageStyles: Record<string, string> = {
    "--background": (ps.backgroundColor as string) || "#fafafa",
    "--text": (ps.textColor as string) || "#1a1a1a",
    "--accent": (ps.accentColor as string) || "#1a1a1a",
    "--button-bg": (ps.buttonColor as string) || "#1a1a1a",
    "--button-fg": "#FFFFFF",
    "--border-color": (ps.borderColor as string) || "#ebebeb",
    "--font-heading": fontStack((ps.headingFont as string) || "inter"),
    "--font-body": fontStack((ps.bodyFont as string) || "inter"),
  };

  // Load Google Fonts
  const fontKeys = [
    (ps.headingFont as string) || "inter",
    (ps.bodyFont as string) || "inter",
  ];
  const fontsUrl = googleFontsUrl(fontKeys);

  // Mock guest data
  const mockAccount = {
    id: "preview_guest",
    email: "cornelia.lindqvist@exempel.se",
    name: "Cornelia Lindqvist",
    phone: "073-123 45 67",
    firstName: "Cornelia",
    lastName: "Lindqvist",
    address1: "Havsgatan 8",
    address2: null,
    city: "Halmstad",
    postalCode: "302 45",
    country: "SE",
    verifiedEmail: true,
    emailMarketingState: "NOT_SUBSCRIBED",
  };

  return (
    <>
      {fontsUrl && <link rel="stylesheet" href={fontsUrl} />}
      <GuestPageShell config={config}>
        <AccountClient
          tenantName={tenant.name}
          guestAccount={mockAccount}
          bookingCount={2}
          orderCount={3}
          pageStyles={pageStyles}
        />
      </GuestPageShell>
    </>
  );
}
