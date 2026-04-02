import { redirect } from "next/navigation";
import { resolveGuestContext } from "../../_lib/portal/resolveGuestContext";
import { getPageSettings } from "@/app/_lib/pages/config";
import { FONT_CATALOG } from "@/app/_lib/fonts/catalog";
import { googleFontsUrl } from "../../_lib/theme/googleFonts";
import GuestPageShell from "../../_components/GuestPageShell";
import OrdersClient from "./OrdersClient";
import "../../login/login-otp.css";
import "../account.css";
import "./orders.css";

export const dynamic = "force-dynamic";

const SANS_FALLBACK = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";

function fontStack(key: string): string {
  const f = FONT_CATALOG.find((c) => c.key === key);
  if (!f) return SANS_FALLBACK;
  return `${f.label}, ${f.serif ? "ui-serif, Georgia, serif" : SANS_FALLBACK}`;
}

export default async function AccountOrdersPage() {
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

  // Serialize orders for client component (dates → ISO strings)
  const orders = ctx.orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    totalAmount: o.totalAmount,
    currency: o.currency,
    createdAt: o.createdAt.toISOString(),
    lineItems: o.lineItems.map((li) => ({
      id: li.id,
      title: li.title,
      variantTitle: li.variantTitle,
      quantity: li.quantity,
      totalAmount: li.totalAmount,
      imageUrl: li.imageUrl,
    })),
  }));

  return (
    <>
      {fontsUrl && <link rel="stylesheet" href={fontsUrl} />}
      <GuestPageShell config={ctx.config}>
        <OrdersClient orders={orders} pageStyles={pageStyles} />
      </GuestPageShell>
    </>
  );
}
