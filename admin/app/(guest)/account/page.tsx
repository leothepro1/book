import { redirect } from "next/navigation";
import { resolveGuestContext } from "../_lib/portal/resolveGuestContext";
import { getPageSettings } from "@/app/_lib/pages/config";
import { FONT_CATALOG } from "@/app/_lib/fonts/catalog";
import { googleFontsUrl } from "../_lib/theme/googleFonts";
import GuestPageShell from "../_components/GuestPageShell";
import AccountClient from "./AccountClient";
import "../login/login-otp.css";
import "./account.css";

export const dynamic = "force-dynamic";

const SANS_FALLBACK = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";

function fontStack(key: string): string {
  const f = FONT_CATALOG.find((c) => c.key === key);
  if (!f) return SANS_FALLBACK;
  return `${f.label}, ${f.serif ? "ui-serif, Georgia, serif" : SANS_FALLBACK}`;
}

/**
 * /account — Session-gated guest account page.
 *
 * Primary landing page after login and registration.
 * Shows profile (editable), email verification status, and logout.
 * Works even if the guest has no bookings or orders.
 */
export default async function AccountPage() {
  const ctx = await resolveGuestContext();
  if (!ctx) redirect("/login");

  const ps = getPageSettings(ctx.config, "profile");

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

  const fontKeys = [
    (ps.headingFont as string) || "inter",
    (ps.bodyFont as string) || "inter",
  ];
  const fontsUrl = googleFontsUrl(fontKeys);

  return (
    <>
      {fontsUrl && <link rel="stylesheet" href={fontsUrl} />}
      <GuestPageShell config={ctx.config}>
        <AccountClient
          tenantName={ctx.tenant.name}
          guestAccount={ctx.guestAccount}
          bookingCount={ctx.bookings.length}
          orderCount={ctx.orders.length}
          pageStyles={pageStyles}
        />
      </GuestPageShell>
    </>
  );
}
