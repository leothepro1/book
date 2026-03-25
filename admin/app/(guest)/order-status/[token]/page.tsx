import { notFound } from "next/navigation";
import { prisma } from "@/app/_lib/db/prisma";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Betalning bekräftas",
  PAID: "Betald",
  FULFILLED: "Slutförd",
  REFUNDED: "Återbetald",
  CANCELLED: "Avbruten",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#d97706",
  PAID: "#16a34a",
  FULFILLED: "#16a34a",
  REFUNDED: "#6b7280",
  CANCELLED: "#ef4444",
};

/**
 * Public order status page — no auth required.
 * Accessed via link in ORDER_CONFIRMED email.
 * Shows only safe public information.
 */
export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const order = await prisma.order.findUnique({
    where: { statusToken: token },
    select: {
      orderNumber: true,
      status: true,
      createdAt: true,
      currency: true,
      totalAmount: true,
      lineItems: {
        select: {
          title: true,
          variantTitle: true,
          quantity: true,
        },
      },
    },
  });

  if (!order) notFound();

  const statusLabel = STATUS_LABELS[order.status] ?? order.status;
  const statusColor = STATUS_COLORS[order.status] ?? "#6b7280";

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "clamp(2rem, 5vw, 4rem) 1.5rem", fontFamily: '"Inter", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "clamp(1.25rem, 1rem + 1vw, 1.75rem)", fontWeight: 600, margin: "0 0 0.5rem" }}>
          Order #{order.orderNumber}
        </h1>
        <span style={{
          display: "inline-block",
          fontSize: "0.8125rem",
          fontWeight: 600,
          padding: "4px 14px",
          borderRadius: 99,
          backgroundColor: `${statusColor}18`,
          color: statusColor,
        }}>
          {statusLabel}
        </span>
      </div>

      <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden", marginBottom: "1.5rem" }}>
        {order.lineItems.map((item, i) => (
          <div
            key={i}
            style={{
              padding: "0.75rem 1.25rem",
              borderBottom: "1px solid #f0f0f0",
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.875rem",
            }}
          >
            <span>
              {item.title}
              {item.variantTitle && <span style={{ color: "#888" }}> · {item.variantTitle}</span>}
            </span>
            {item.quantity > 1 && <span style={{ color: "#888" }}>×{item.quantity}</span>}
          </div>
        ))}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "1rem 1.25rem",
          fontWeight: 600,
          fontSize: "0.9375rem",
        }}>
          <span>Totalt</span>
          <span>{formatPriceDisplay(order.totalAmount, order.currency)} kr</span>
        </div>
      </div>

      <p style={{ fontSize: "0.8125rem", color: "#888", textAlign: "center" }}>
        {order.createdAt.toLocaleDateString("sv-SE")}
      </p>

      <div style={{ textAlign: "center", marginTop: "2rem" }}>
        <a
          href="/login"
          style={{
            fontSize: "0.875rem",
            color: "#666",
            textDecoration: "underline",
          }}
        >
          Logga in för att se alla dina beställningar
        </a>
      </div>
    </div>
  );
}
