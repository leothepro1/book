import { redirect, notFound } from "next/navigation";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveGuestContext } from "../../../_lib/portal/resolveGuestContext";
import GuestPageShell from "../../../_components/GuestPageShell";
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

export default async function PortalOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const ctx = await resolveGuestContext();
  if (!ctx) redirect("/login");

  const { orderId } = await params;

  // Security: verify the guest owns this order
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      guestAccountId: ctx.guestAccount.id,
    },
    include: { lineItems: true },
  });

  if (!order) notFound();

  const statusLabel = STATUS_LABELS[order.status] ?? order.status;
  const statusColor = STATUS_COLORS[order.status] ?? "#6b7280";
  const meta = order.metadata as Record<string, unknown> | null;

  return (
    <GuestPageShell config={ctx.config}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "clamp(2rem, 5vw, 3rem) 1rem" }}>
        {/* Back link */}
        <a
          href="/portal/orders"
          style={{ fontSize: "0.8125rem", color: "var(--text)", opacity: 0.6, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.25rem", marginBottom: "1.5rem" }}
        >
          ← Mina beställningar
        </a>

        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "clamp(1.25rem, 1rem + 1vw, 1.75rem)", fontWeight: 600, margin: "0 0 0.5rem", color: "var(--text)" }}>
            Order #{order.orderNumber}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{
              display: "inline-block",
              fontSize: "0.75rem",
              fontWeight: 600,
              padding: "2px 10px",
              borderRadius: 99,
              backgroundColor: `${statusColor}18`,
              color: statusColor,
            }}>
              {statusLabel}
            </span>
            <span style={{ fontSize: "0.8125rem", color: "var(--text)", opacity: 0.5 }}>
              {order.createdAt.toLocaleDateString("sv-SE")}
            </span>
          </div>
        </div>

        {/* Pending message */}
        {order.status === "PENDING" && (
          <div style={{
            padding: "1rem 1.25rem",
            borderRadius: 12,
            backgroundColor: "color-mix(in srgb, #d97706 8%, transparent)",
            marginBottom: "1.5rem",
            fontSize: "0.875rem",
            color: "var(--text)",
          }}>
            Vi verifierar din betalning. Du får en bekräftelse via e-post strax.
          </div>
        )}

        {/* Line items */}
        <div style={{ border: "1px solid color-mix(in srgb, var(--text) 12%, transparent)", borderRadius: 12, overflow: "hidden", marginBottom: "1.5rem" }}>
          {order.lineItems.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.75rem 1.25rem",
                borderBottom: "1px solid color-mix(in srgb, var(--text) 6%, transparent)",
              }}
            >
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }}
                />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text)" }}>{item.title}</div>
                {item.variantTitle && (
                  <div style={{ fontSize: "0.75rem", color: "var(--text)", opacity: 0.6 }}>{item.variantTitle}</div>
                )}
                {item.quantity > 1 && (
                  <div style={{ fontSize: "0.75rem", color: "var(--text)", opacity: 0.5 }}>Antal: {item.quantity}</div>
                )}
              </div>
              <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text)" }}>
                {formatPriceDisplay(item.totalAmount, item.currency)} kr
              </div>
            </div>
          ))}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "1rem 1.25rem",
            fontWeight: 600,
            fontSize: "0.9375rem",
            color: "var(--text)",
          }}>
            <span>Totalt</span>
            <span>{formatPriceDisplay(order.totalAmount, order.currency)} kr</span>
          </div>
        </div>

        {/* Metadata (dates, etc.) */}
        {meta?.checkIn && meta?.checkOut && (
          <div style={{
            display: "flex", gap: "2rem", fontSize: "0.8125rem",
            padding: "1rem 1.25rem",
            border: "1px solid color-mix(in srgb, var(--text) 12%, transparent)",
            borderRadius: 12, marginBottom: "1.5rem",
          }}>
            <div>
              <div style={{ fontSize: "0.6875rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text)", opacity: 0.5 }}>Incheckning</div>
              <div style={{ fontWeight: 500, color: "var(--text)" }}>{String(meta.checkIn)}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.6875rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text)", opacity: 0.5 }}>Utcheckning</div>
              <div style={{ fontWeight: 500, color: "var(--text)" }}>{String(meta.checkOut)}</div>
            </div>
          </div>
        )}

        {/* Confirmation */}
        {(order.status === "PAID" || order.status === "FULFILLED") && (
          <p style={{ fontSize: "0.875rem", color: "var(--text)", opacity: 0.6, textAlign: "center" }}>
            {order.guestEmail && `Bekräftelse skickad till ${order.guestEmail}`}
          </p>
        )}
      </div>
    </GuestPageShell>
  );
}
