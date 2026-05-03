/**
 * Invoice payment — success landing page.
 *
 * Stripe redirects the buyer here after a confirmed payment
 * (`return_url` from `confirmPayment`). The webhook
 * (`api/webhooks/stripe/handle-draft-order-pi.ts`) is the source of
 * truth for the DraftOrder → PAID transition; this page is purely
 * informational. We render the current draft status — usually PAID
 * by the time the redirect lands, but we tolerate the webhook race
 * and render a "betalning bekräftas" state when the row is still
 * INVOICED.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { getDraftByShareToken } from "@/app/_lib/draft-orders";
import { formatSek } from "@/app/_lib/money/format";
import "../../invoice.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function InvoiceSuccessPage({ params }: PageProps) {
  const { token } = await params;

  const tenant = await resolveTenantFromHost();
  if (!tenant) notFound();

  const result = await getDraftByShareToken(token, tenant.id);
  if (!result) notFound();

  const { draft } = result;
  const isPaid = draft.status === "PAID" || draft.status === "COMPLETED";

  return (
    <main className="inv inv--paid">
      <header className="inv__header">
        <h1 className="inv__title">Faktura {draft.displayNumber}</h1>
      </header>

      {isPaid ? (
        <div className="inv__notice inv__notice--success">
          <p className="inv__notice-title">Tack — fakturan är betald</p>
          <p className="inv__notice-body">
            Vi har mottagit{" "}
            {formatSek(draft.totalCents, { currency: draft.currency })}.
            En bekräftelse skickas till din e-post.
          </p>
        </div>
      ) : (
        <div className="inv__notice">
          <p className="inv__notice-title">Betalningen bekräftas</p>
          <p className="inv__notice-body">
            Vi väntar på slutgiltig bekräftelse från betalningsleverantören.
            Du kan stänga den här sidan — du får ett kvitto på e-post så
            snart vi har bekräftat betalningen. Om du fortfarande väntar
            efter några minuter,{" "}
            <Link
              className="inv__notice-link"
              href={`/invoice/${token}`}
            >
              gå tillbaka till fakturan
            </Link>
            .
          </p>
        </div>
      )}
    </main>
  );
}
