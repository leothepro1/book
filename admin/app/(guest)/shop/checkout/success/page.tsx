import { prisma } from "@/app/_lib/db/prisma";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { SuccessClient } from "./SuccessClient";

export const dynamic = "force-dynamic";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  if (!session_id) {
    return (
      <div style={{ padding: "3rem", textAlign: "center" }}>
        <p>Ogiltig session.</p>
      </div>
    );
  }

  // Find order by Stripe checkout session ID
  const order = await prisma.order.findUnique({
    where: { stripeCheckoutSessionId: session_id },
    include: {
      lineItems: true,
    },
  });

  if (!order) {
    return (
      <div style={{ padding: "3rem", textAlign: "center" }}>
        <p>Ordern hittades inte.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "clamp(2rem, 5vw, 4rem) 1.5rem" }}>
      <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
        <span
          className="material-symbols-rounded"
          style={{
            fontSize: 56,
            color: "var(--success, #16a34a)",
            fontVariationSettings: "'FILL' 1, 'wght' 400",
          }}
        >
          check_circle
        </span>
        <h1 style={{ fontSize: "clamp(1.5rem, 1.25rem + 1vw, 2rem)", fontWeight: 600, margin: "1rem 0 0.5rem" }}>
          Tack för din beställning!
        </h1>
        <p style={{ fontSize: "0.9375rem", color: "#666", margin: 0 }}>
          Ordernummer: <strong>#{order.orderNumber}</strong>
        </p>
      </div>

      {/* Order summary */}
      <div
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #e5e5e5" }}>
          <h2 style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0 }}>Sammanfattning</h2>
        </div>
        <div>
          {order.lineItems.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.75rem 1.25rem",
                borderBottom: "1px solid #f0f0f0",
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
                <div style={{ fontSize: "0.8125rem", fontWeight: 500 }}>{item.title}</div>
                {item.variantTitle && (
                  <div style={{ fontSize: "0.75rem", color: "#888" }}>{item.variantTitle}</div>
                )}
              </div>
              <div style={{ fontSize: "0.8125rem", color: "#666" }}>
                {item.quantity} x {formatPriceDisplay(item.unitAmount, item.currency)} kr
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "1rem 1.25rem",
            fontWeight: 600,
            fontSize: "0.9375rem",
          }}
        >
          <span>Totalt</span>
          <span>{formatPriceDisplay(order.totalAmount, order.currency)} kr</span>
        </div>
      </div>

      {order.guestEmail && (
        <p style={{ textAlign: "center", fontSize: "0.8125rem", color: "#888", marginTop: "1.5rem" }}>
          En bekräftelse har skickats till {order.guestEmail}
        </p>
      )}

      {/* Client component to clear cart */}
      <SuccessClient tenantId={order.tenantId} />
    </div>
  );
}
