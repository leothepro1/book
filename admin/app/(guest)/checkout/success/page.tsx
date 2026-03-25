import { notFound } from "next/navigation";
import { prisma } from "@/app/_lib/db/prisma";
import { resolveTenantFromHost } from "../../_lib/tenant/resolveTenantFromHost";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";

export const dynamic = "force-dynamic";

/**
 * Unified checkout success page.
 *
 * Accepts ?orderId=xxx — looks up Order, verifies tenant ownership,
 * displays confirmation with order details.
 *
 * If the order is still PENDING (webhook hasn't fired yet), shows
 * a "confirming payment" state — the guest can refresh.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const tenant = await resolveTenantFromHost();
  if (!tenant) return notFound();

  const sp = await searchParams;
  const orderId = sp.orderId;
  if (!orderId) return notFound();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { lineItems: true },
  });

  // Verify order exists and belongs to this tenant
  if (!order || order.tenantId !== tenant.id) return notFound();

  const isPending = order.status === "PENDING";
  const meta = order.metadata as Record<string, unknown> | null;
  const checkIn = meta?.checkIn as string | undefined;
  const checkOut = meta?.checkOut as string | undefined;
  const guests = meta?.guests as number | undefined;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "clamp(2rem, 5vw, 4rem) 1.5rem", fontFamily: '"Inter", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' }}>
      <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
        {isPending ? (
          <>
            <span
              className="material-symbols-rounded"
              style={{ fontSize: 56, color: "#d97706", fontVariationSettings: "'FILL' 1, 'wght' 400" }}
            >
              schedule
            </span>
            <h1 style={{ fontSize: "clamp(1.5rem, 1.25rem + 1vw, 2rem)", fontWeight: 600, margin: "1rem 0 0.5rem" }}>
              Betalning bekräftas...
            </h1>
            <p style={{ fontSize: "0.9375rem", color: "#666", margin: 0 }}>
              Vi verifierar din betalning. Du får en bekräftelse via e-post strax.
            </p>
          </>
        ) : (
          <>
            <span
              className="material-symbols-rounded"
              style={{ fontSize: 56, color: "#16a34a", fontVariationSettings: "'FILL' 1, 'wght' 400" }}
            >
              check_circle
            </span>
            <h1 style={{ fontSize: "clamp(1.5rem, 1.25rem + 1vw, 2rem)", fontWeight: 600, margin: "1rem 0 0.5rem" }}>
              Tack för din bokning!
            </h1>
            <p style={{ fontSize: "0.9375rem", color: "#666", margin: 0 }}>
              Ordernummer: <strong>#{order.orderNumber}</strong>
            </p>
          </>
        )}
      </div>

      {/* Order summary card */}
      <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
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
                // eslint-disable-next-line @next/next/no-img-element
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
                {formatPriceDisplay(item.totalAmount, item.currency)} kr
              </div>
            </div>
          ))}
        </div>

        {/* Dates + guests for accommodation */}
        {checkIn && checkOut && (
          <div style={{ padding: "0.75rem 1.25rem", borderBottom: "1px solid #f0f0f0", display: "flex", gap: "2rem", fontSize: "0.8125rem" }}>
            <div>
              <div style={{ color: "#888", fontSize: "0.6875rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>Incheckning</div>
              <div style={{ fontWeight: 500 }}>{format(parseISO(checkIn), "d MMMM yyyy", { locale: sv })}</div>
            </div>
            <div>
              <div style={{ color: "#888", fontSize: "0.6875rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>Utcheckning</div>
              <div style={{ fontWeight: 500 }}>{format(parseISO(checkOut), "d MMMM yyyy", { locale: sv })}</div>
            </div>
            {guests && (
              <div>
                <div style={{ color: "#888", fontSize: "0.6875rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>Gäster</div>
                <div style={{ fontWeight: 500 }}>{guests}</div>
              </div>
            )}
          </div>
        )}

        {/* Total */}
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

      {/* Account CTA — guest account auto-created by webhook */}
      {order.guestEmail && !isPending && (
        <div style={{
          marginTop: "2rem",
          padding: "1.5rem",
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          textAlign: "center",
        }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
            Ditt konto är redo
          </h2>
          <p style={{ fontSize: "0.8125rem", color: "#666", margin: "0 0 1rem" }}>
            Vi har skapat ett konto åt dig. Logga in för att se alla dina beställningar och hantera dina uppgifter.
          </p>
          <a
            href="/login"
            style={{
              display: "inline-block",
              padding: "10px 24px",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#fff",
              backgroundColor: "#1a1a1a",
              borderRadius: 8,
              textDecoration: "none",
            }}
          >
            Gå till mitt konto →
          </a>
        </div>
      )}
    </div>
  );
}
