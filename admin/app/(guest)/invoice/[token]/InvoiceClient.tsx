/**
 * Customer-facing invoice payment client.
 *
 * Mounts Stripe Elements with the embedded PaymentElement (per recon Q3:
 * single PaymentElement, not the legacy custom accordion). Fetches the
 * `clientSecret` runtime via the `getInvoiceClientSecretAction` server
 * action — it is intentionally NOT serialized into HTML by the server
 * page so it stays out of static caches and the page source.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import {
  getInvoiceClientSecretAction,
  type GetInvoiceClientSecretErrorCode,
} from "./actions";

const stripePromise: Promise<StripeJs | null> = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
);

export type InvoiceClientProps = {
  token: string;
  displayNumber: string;
  /** Serialized bigint (öre) — server-passed. */
  totalCents: string;
  currency: string;
};

type LoadState =
  | { phase: "loading" }
  | {
      phase: "ready";
      clientSecret: string;
    }
  | {
      phase: "error";
      code: GetInvoiceClientSecretErrorCode;
      message: string;
    };

export function InvoiceClient(props: InvoiceClientProps) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setState({ phase: "loading" });

    (async () => {
      const result = await getInvoiceClientSecretAction(props.token);
      if (cancelledRef.current) return;
      if (result.ok) {
        setState({ phase: "ready", clientSecret: result.clientSecret });
      } else {
        setState({
          phase: "error",
          code: result.code,
          message: result.message,
        });
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [props.token]);

  if (state.phase === "loading") {
    return (
      <section className="inv-pay" aria-busy="true">
        <div className="inv-pay__loading">Laddar betalning…</div>
      </section>
    );
  }

  if (state.phase === "error") {
    return (
      <section className="inv-pay">
        <div className="inv-pay__error" role="alert">
          {state.message}
        </div>
      </section>
    );
  }

  return (
    <section className="inv-pay">
      <h2 className="inv-pay__title">Betala</h2>
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret: state.clientSecret,
          locale: "sv",
          appearance: { theme: "stripe" },
        }}
      >
        <PaymentForm token={props.token} displayNumber={props.displayNumber} />
      </Elements>
    </section>
  );
}

// ── Inner form (inside Elements provider) ──────────────────────

function PaymentForm({
  token,
  displayNumber: _displayNumber,
}: {
  token: string;
  displayNumber: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!stripe || !elements) return;

      setSubmitting(true);
      setError(null);

      // Build absolute return URL so Stripe accepts it for redirect-based
      // methods (Klarna, bank transfer). Window is always defined here —
      // `use client` guarantees it.
      const returnUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/invoice/${token}/success`
          : `/invoice/${token}/success`;

      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
      });

      // confirmPayment redirects on success — we only land here on error
      // or for inline error responses.
      if (result.error) {
        setError(result.error.message ?? "Betalningen kunde inte slutföras.");
        setSubmitting(false);
      }
    },
    [stripe, elements, token],
  );

  return (
    <form className="inv-pay__form" onSubmit={handleSubmit}>
      <PaymentElement options={{ layout: "tabs" }} />

      {error !== null ? (
        <p className="inv-pay__error" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        className="inv-pay__submit"
        disabled={!stripe || !elements || submitting}
      >
        {submitting ? "Bearbetar…" : "Betala fakturan"}
      </button>
    </form>
  );
}
