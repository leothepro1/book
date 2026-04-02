import { prisma } from "@/app/_lib/db/prisma";
import { getTenantConfig } from "@/app/(guest)/_lib/tenant/getTenantConfig";
import { getPageSettings } from "@/app/_lib/pages/config";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { FONT_CATALOG } from "@/app/_lib/fonts/catalog";
import { googleFontsUrl } from "@/app/(guest)/_lib/theme/googleFonts";
import GuestPageShell from "@/app/(guest)/_components/GuestPageShell";
import OrdersClient from "@/app/(guest)/account/orders/OrdersClient";
import "@/app/(guest)/login/login-otp.css";
import "@/app/(guest)/account/account.css";
import "@/app/(guest)/account/orders/orders.css";

const SANS_FALLBACK = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";

function fontStack(key: string): string {
  const f = FONT_CATALOG.find((c) => c.key === key);
  if (!f) return SANS_FALLBACK;
  return `${f.label}, ${f.serif ? "ui-serif, Georgia, serif" : SANS_FALLBACK}`;
}

/**
 * Bookings page preview for the editor.
 *
 * Renders the orders page (OrdersClient) with mock order data
 * so tenants can preview the booking list experience.
 */
export async function BookingsPreviewPage() {
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
  const ps = getPageSettings(config, "bookings");

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

  // ── Mock orders ──────────────────────────────────────────
  const mockOrders = [
    {
      id: "mock_order_1",
      orderNumber: 1042,
      status: "PAID",
      totalAmount: 1495000,
      currency: "SEK",
      createdAt: "2026-03-31T14:22:00.000Z",
      lineItems: [
        {
          id: "li_1a",
          title: "Havsutsikt Dubbelrum",
          variantTitle: "3 nätter · 14–17 jun",
          quantity: 1,
          totalAmount: 1195000,
          imageUrl: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=200&h=200&fit=crop",
        },
        {
          id: "li_1b",
          title: "Frukostbuffé",
          variantTitle: "3 dagar",
          quantity: 2,
          totalAmount: 300000,
          imageUrl: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=200&h=200&fit=crop",
        },
      ],
    },
    {
      id: "mock_order_2",
      orderNumber: 1038,
      status: "PENDING",
      totalAmount: 289900,
      currency: "SEK",
      createdAt: "2026-04-01T09:15:00.000Z",
      lineItems: [
        {
          id: "li_2a",
          title: "Spa-paket Deluxe",
          variantTitle: "2 personer",
          quantity: 1,
          totalAmount: 289900,
          imageUrl: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=200&h=200&fit=crop",
        },
      ],
    },
    {
      id: "mock_order_3",
      orderNumber: 1019,
      status: "FULFILLED",
      totalAmount: 985000,
      currency: "SEK",
      createdAt: "2026-02-15T11:30:00.000Z",
      lineItems: [
        {
          id: "li_3a",
          title: "Stuga med sjöutsikt",
          variantTitle: "5 nätter · 2–7 maj",
          quantity: 1,
          totalAmount: 875000,
          imageUrl: "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=200&h=200&fit=crop",
        },
        {
          id: "li_3b",
          title: "Kajak-hyra",
          variantTitle: null,
          quantity: 2,
          totalAmount: 110000,
          imageUrl: null,
        },
      ],
    },
    {
      id: "mock_order_4",
      orderNumber: 1007,
      status: "REFUNDED",
      totalAmount: 425000,
      currency: "SEK",
      createdAt: "2026-01-02T16:45:00.000Z",
      lineItems: [
        {
          id: "li_4a",
          title: "Svit med balkong",
          variantTitle: "2 nätter · 15–17 mar",
          quantity: 1,
          totalAmount: 425000,
          imageUrl: "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=200&h=200&fit=crop",
        },
      ],
    },
  ];

  return (
    <>
      {fontsUrl && <link rel="stylesheet" href={fontsUrl} />}
      <GuestPageShell config={config}>
        <OrdersClient orders={mockOrders} pageStyles={pageStyles} />
      </GuestPageShell>
    </>
  );
}
