/**
 * Invoice payment — cancelled landing page.
 *
 * Stripe redirects the buyer here when payment is cancelled before
 * confirmation (e.g. they back out of a Klarna or bank-transfer flow).
 * The PaymentIntent itself is reusable — sending the buyer back to
 * /invoice/{token} mounts a fresh Elements session with the same
 * clientSecret.
 */

import type { Metadata } from "next";
import Link from "next/link";
import "../../invoice.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function InvoiceCancelledPage({ params }: PageProps) {
  const { token } = await params;

  return (
    <main className="inv">
      <header className="inv__header">
        <h1 className="inv__title">Betalningen avbröts</h1>
      </header>
      <div className="inv__notice">
        <p className="inv__notice-title">Inget belopp har dragits</p>
        <p className="inv__notice-body">
          Du avbröt betalningen innan den slutfördes. Du kan försöka
          igen när du är redo.
        </p>
        <p style={{ marginTop: 16 }}>
          <Link className="inv-pay__submit" href={`/invoice/${token}`}>
            Tillbaka till fakturan
          </Link>
        </p>
      </div>
    </main>
  );
}
