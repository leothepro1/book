import { redirect } from "next/navigation";
import { resolveGuestContext } from "../../_lib/portal/resolveGuestContext";
import GuestPageShell from "../../_components/GuestPageShell";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { formatOrderNumberForTenant } from "@/app/_lib/orders/format-server";
import type { GuestOrder } from "../../_lib/portal/resolveGuestContext";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Väntar",
  PAID: "Betald",
  FULFILLED: "Slutförd",
  REFUNDED: "Återbetald",
  CANCELLED: "Avbruten",
};

function splitOrders(all: GuestOrder[]) {
  return {
    active: all.filter((o) => o.status === "PENDING" || o.status === "PAID"),
    past: all.filter((o) => o.status === "FULFILLED" || o.status === "REFUNDED"),
  };
}

export default async function PortalOrdersPage() {
  const ctx = await resolveGuestContext();
  if (!ctx) redirect("/login");

  const { active, past } = splitOrders(ctx.orders);

  // Pre-format all order numbers with tenant prefix/suffix
  const orderDisplayNumbers = new Map<string, string>();
  for (const order of ctx.orders) {
    orderDisplayNumbers.set(
      order.id,
      await formatOrderNumberForTenant(ctx.config.tenantId, order.orderNumber),
    );
  }

  return (
    <GuestPageShell config={ctx.config}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "clamp(2rem, 5vw, 3rem) 1rem" }}>
        <h1 style={{ fontSize: "clamp(1.25rem, 1rem + 1vw, 1.75rem)", fontWeight: 600, margin: "0 0 1.5rem", color: "var(--text)" }}>
          Mina beställningar
        </h1>

        {ctx.orders.length === 0 && (
          <p style={{ fontSize: "0.9375rem", color: "var(--text)", opacity: 0.6 }}>
            Du har inga beställningar ännu.
          </p>
        )}

        {active.length > 0 && (
          <OrderSection title="Aktuella" orders={active} displayNumbers={orderDisplayNumbers} />
        )}

        {past.length > 0 && (
          <OrderSection title="Tidigare" orders={past} displayNumbers={orderDisplayNumbers} />
        )}
      </div>
    </GuestPageShell>
  );
}

function OrderSection({ title, orders, displayNumbers }: { title: string; orders: GuestOrder[]; displayNumbers: Map<string, string> }) {
  return (
    <section style={{ marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text)", opacity: 0.5, margin: "0 0 0.75rem" }}>
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {orders.map((order) => (
          <a
            key={order.id}
            href={`/portal/orders/${order.id}`}
            style={{
              display: "block",
              border: "1px solid color-mix(in srgb, var(--text) 12%, transparent)",
              borderRadius: 12,
              padding: "1rem 1.25rem",
              textDecoration: "none",
              color: "inherit",
              transition: "border-color 0.15s",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.25rem" }}>
              <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text)" }}>
                Order {displayNumbers.get(order.id) ?? `#${order.orderNumber}`}
              </span>
              <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text)", opacity: 0.7 }}>
                {STATUS_LABELS[order.status] ?? order.status}
              </span>
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text)", opacity: 0.6 }}>
              {order.createdAt.toLocaleDateString("sv-SE")} · {formatPriceDisplay(order.totalAmount, order.currency)} kr
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text)", opacity: 0.5, marginTop: "0.25rem" }}>
              {order.lineItems.map((li) => li.title).join(", ")}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
