import { notFound } from "next/navigation";
import { getStripe } from "@/app/_lib/stripe/client";
import { prisma } from "@/app/_lib/db/prisma";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import "../gift-card.css";

export const dynamic = "force-dynamic";

export default async function GiftCardConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const tenant = await resolveTenantFromHost();
  if (!tenant) return notFound();

  const sp = await searchParams;
  const paymentIntentId = sp.payment_intent;

  if (!paymentIntentId) return notFound();

  // Verify PaymentIntent status server-side — never trust URL params
  const stripe = getStripe();

  const tenantStripe = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { stripeAccountId: true },
  });

  let pi;
  try {
    pi = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      tenantStripe?.stripeAccountId
        ? { stripeAccount: tenantStripe.stripeAccountId }
        : undefined,
    );
  } catch {
    return (
      <div className="gc-page">
        <div className="gc-container">
          <div className="gc-card">
            <ErrorState />
          </div>
        </div>
      </div>
    );
  }

  if (pi.status !== "succeeded") {
    return (
      <div className="gc-page">
        <div className="gc-container">
          <div className="gc-card">
            <ErrorState />
          </div>
        </div>
      </div>
    );
  }

  // Fetch order and gift card from metadata
  const orderId = pi.metadata?.orderId;
  const order = orderId
    ? await prisma.order.findUnique({
        where: { id: orderId },
        select: { orderNumber: true, totalAmount: true, currency: true },
      })
    : null;

  const giftCard = orderId
    ? await prisma.giftCard.findUnique({
        where: { orderId },
        select: {
          recipientName: true,
          recipientEmail: true,
          senderName: true,
          initialAmount: true,
          scheduledAt: true,
          sentAt: true,
        },
      })
    : null;

  const isImmediate =
    giftCard?.scheduledAt &&
    giftCard.scheduledAt.getTime() <= Date.now() + 60_000;

  const scheduledDateStr = giftCard?.scheduledAt
    ? giftCard.scheduledAt.toLocaleDateString("sv-SE", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="gc-page">
      <div className="gc-container">
        <div className="gc-card">
          <div className="gc-confirm">
            <span className="material-symbols-rounded gc-confirm__icon">
              check_circle
            </span>

            <h1 className="gc-confirm__title">
              {isImmediate
                ? "Presentkortet är på väg!"
                : `Presentkortet skickas ${scheduledDateStr}`}
            </h1>

            <p className="gc-confirm__subtitle">
              {giftCard
                ? `Vi skickar presentkortet till ${giftCard.recipientEmail} ${isImmediate ? "inom kort" : scheduledDateStr}.`
                : "Betalningen är bekräftad."}
            </p>

            <div className="gc-confirm__details">
              {order && (
                <div className="gc-confirm__row">
                  <span className="gc-confirm__row-label">Ordernummer</span>
                  <span className="gc-confirm__row-value">#{order.orderNumber}</span>
                </div>
              )}

              {giftCard && (
                <>
                  <div className="gc-confirm__row">
                    <span className="gc-confirm__row-label">Belopp</span>
                    <span className="gc-confirm__row-value">
                      {formatPriceDisplay(giftCard.initialAmount, order?.currency ?? "SEK")} kr
                    </span>
                  </div>
                  <div className="gc-confirm__row">
                    <span className="gc-confirm__row-label">Till</span>
                    <span className="gc-confirm__row-value">{giftCard.recipientName}</span>
                  </div>
                  <div className="gc-confirm__row">
                    <span className="gc-confirm__row-label">E-post</span>
                    <span className="gc-confirm__row-value">{giftCard.recipientEmail}</span>
                  </div>
                  <div className="gc-confirm__row">
                    <span className="gc-confirm__row-label">Från</span>
                    <span className="gc-confirm__row-value">{giftCard.senderName}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="gc-error-page">
      <span className="material-symbols-rounded gc-error-page__icon">error</span>
      <h2 className="gc-error-page__title">Betalningen kunde inte verifieras</h2>
      <p className="gc-error-page__text">
        Om du har debiterats, kontakta hotellet direkt. Försök annars igen.
      </p>
      <a href="/gift-cards" className="gc-btn gc-btn--primary" style={{ display: "inline-flex", textDecoration: "none" }}>
        Tillbaka till presentkort
      </a>
    </div>
  );
}
