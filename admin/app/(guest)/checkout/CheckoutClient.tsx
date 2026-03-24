"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardNumberElement, CardExpiryElement, CardCvcElement, PaymentRequestButtonElement, useStripe, useElements } from "@stripe/react-stripe-js";
import type { PaymentRequest } from "@stripe/stripe-js";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { CheckoutModal } from "./CheckoutModal";
import "./checkout.css";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
);

interface CheckoutProps {
  product: {
    title: string;
    image: string | null;
    price: number;
    currency: string;
    ratePlanName: string | null;
  } | null;
  productSlug: string;
  checkIn: string | null;
  checkOut: string | null;
  guests: number;
  nights: number;
  bookingTerms: string | null;
  header: {
    logoUrl: string | null;
    logoWidth: number;
  };
  ratePlanId: string | null;
}

type StepId = 1 | 2 | 3 | 4;
type PaymentType = "full" | "klarna";
type PaymentMethod = "card" | "paypal" | "gpay" | "applepay";

const CARD_STYLE = {
  base: {
    fontSize: "14px",
    fontFamily: '"Inter", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    color: "#1a1a1a",
    fontWeight: "400",
    "::placeholder": { color: "#999" },
  },
  invalid: { color: "#dc2626" },
};

const ALL_PAYMENT_METHODS: Array<{ id: PaymentMethod; title: string; svg: string; redirectDesc?: string; walletType?: "gpay" | "applepay" }> = [
  {
    id: "card",
    title: "Kredit- eller betalkort",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-label="Kreditkort" role="img" focusable="false" style="display: block; height: 32px; width: 32px; padding: 5px; fill: currentcolor;"><path d="M29 5H3a2 2 0 0 0-2 2v18c0 1.1.9 2 2 2h26a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm-7.5 19a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM29 11.5H3v-3h26v3z"></path></svg>`,
  },
  {
    id: "paypal",
    title: "PayPal",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-label="PayPal" role="img" focusable="false" style="display: block; height: 32px; width: 32px;"><path fill="#0079c1" d="m13.26 17.76.02-.1c.1-.34.39-.59.73-.64h2.17c3.36-.07 5.98-1.47 6.85-5.34l.05-.28.07-.36.04-.28.02-.27.02-.26v-.54l-.03-.26-.1-.49c.05.15.07.3.1.45l.02.27.02.25v.32l-.03.26-.06.55c.33.17.63.4.88.68.78.9.93 2.17.64 3.7-.7 3.55-3.02 4.84-6.02 4.9h-.71a.77.77 0 0 0-.74.56l-.03.1-.04.2-.6 3.84-.03.16a.77.77 0 0 1-.66.65h-3.31a.46.46 0 0 1-.46-.45v-.08z"></path><path fill="#00457c" d="M17.6 6c2.13 0 3.8.45 4.71 1.5a3.85 3.85 0 0 1 .63.97c.28.65.36 1.38.25 2.3l-.04.27-.07.36c-.79 4.08-3.46 5.55-6.9 5.61h-2.05c-.4 0-.74.27-.85.65l-.02.1-.93 5.87h-3.8a.53.53 0 0 1-.53-.52v-.09l2.57-16.28c.07-.39.38-.69.77-.73l.1-.01z"></path></svg>`,
    redirectDesc: "Du loggar in på PayPal för att slutföra betalningen.",
  },
  {
    id: "gpay",
    title: "Google Pay",
    walletType: "gpay",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-label="Google Pay" role="img" focusable="false" style="display: block; height: 32px; width: 32px;"><path fill="#3c4043" d="M15.24 15.51v3.31h-1.03v-8.17h2.74c.66-.01 1.3.24 1.77.71.94.9 1 2.38.12 3.34l-.12.11c-.48.47-1.07.7-1.77.7zm0-3.85v2.85h1.74c.38.01.75-.14 1.02-.43.54-.57.52-1.47-.03-2.02a1.4 1.4 0 0 0-1-.4zm6.61 1.39c.76 0 1.37.2 1.81.62.44.4.66.98.66 1.7v3.45h-.99v-.77h-.04c-.43.63-1 .95-1.71.95a2.2 2.2 0 0 1-1.52-.54c-.4-.34-.62-.85-.61-1.37 0-.58.22-1.04.65-1.38.43-.35 1-.52 1.72-.52.62 0 1.12.12 1.52.34v-.24c0-.36-.15-.7-.42-.93a1.57 1.57 0 0 0-2.36.36l-.92-.58a2.44 2.44 0 0 1 2-1.08zm-1.34 4.06c0 .27.13.52.35.68.23.18.5.28.8.27.43 0 .85-.17 1.16-.48.34-.33.51-.71.51-1.16-.32-.26-.77-.39-1.34-.38-.42 0-.78.1-1.06.3a.94.94 0 0 0-.4.64zM30 13.23l-3.46 8.05h-1.06l1.28-2.82-2.26-5.23h1.12l1.64 4.01h.02l1.6-4z"></path><path fill="#4285f4" d="M11.06 14.8c0-.32-.02-.64-.07-.96H6.63v1.8h2.5c-.1.59-.44 1.1-.93 1.43v1.18h1.49a4.6 4.6 0 0 0 1.37-3.46z"></path><path fill="#34a853" d="M6.63 19.38c1.24 0 2.3-.42 3.06-1.13l-1.5-1.18a2.77 2.77 0 0 1-4.17-1.49H2.51v1.22a4.61 4.61 0 0 0 4.13 2.58z"></path><path fill="#fbbc04" d="M4.03 15.59c-.2-.58-.2-1.21 0-1.8v-1.2H2.5a4.71 4.71 0 0 0 0 4.2z"></path><path fill="#ea4335" d="M6.63 11.86c.66-.02 1.3.24 1.77.7l1.32-1.34A4.43 4.43 0 0 0 6.62 10c-1.74 0-3.34 1-4.12 2.59l1.53 1.2a2.77 2.77 0 0 1 2.6-1.93z"></path></svg>`,
  },
  {
    id: "applepay",
    title: "Apple Pay",
    walletType: "applepay",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-label="Apple Pay" role="img" focusable="false" style="display: block; height: 32px; width: 32px;"><path d="M17.05 12.536c-.024-2.426 1.98-3.59 2.07-3.648-1.126-1.648-2.88-1.874-3.504-1.898-1.492-.152-2.912.88-3.67.88-.756 0-1.926-.858-3.166-.834-1.63.024-3.132.948-3.972 2.41-1.692 2.94-.432 7.296 1.216 9.684.806 1.166 1.768 2.476 3.032 2.43 1.216-.048 1.676-.788 3.148-.788 1.472 0 1.884.788 3.168.764 1.308-.024 2.142-1.188 2.94-2.358.928-1.352 1.308-2.662 1.332-2.73-.028-.012-2.556-.98-2.58-3.888z" fill="#1a1a1a"/></svg>`,
  },
];

// ── Step 2: Payment Method Accordion ───────────────────────

interface CardInfo {
  brand: string;
  last4: string;
  funding: string; // "credit" | "debit" | "prepaid" | "unknown"
}

const BRAND_SVGS: Record<string, string> = {
  visa: `<svg viewBox="0 0 32 32" style="height:20px;width:32px"><path fill="#1434CB" d="M13.2 21.3H10.7l1.6-9.8h2.5zm9.1-9.5c-.5-.2-1.3-.4-2.2-.4-2.5 0-4.2 1.3-4.2 3.1 0 1.4 1.2 2.1 2.2 2.6 1 .4 1.3.7 1.3 1.1 0 .6-.8.9-1.5.9-1 0-1.5-.1-2.3-.5l-.3-.2-.4 2.1c.6.3 1.6.5 2.7.5 2.6 0 4.3-1.3 4.3-3.2 0-1.1-.6-1.9-2.1-2.5-.9-.4-1.4-.7-1.4-1.2 0-.4.5-.8 1.5-.8.8 0 1.5.2 1.9.4l.2.1zm6.3-.3h-1.9c-.6 0-1 .2-1.3.7l-3.6 8.5h2.6l.5-1.4h3.1l.3 1.4h2.3zm-3 6.2 1.3-3.5.7 3.5zM9.6 11.5 7.2 18l-.3-1.3C6.4 15 4.8 13.2 3 12.3l2.2 8.9h2.6l3.9-9.8z"/></svg>`,
  mastercard: `<svg viewBox="0 0 32 32" style="height:20px;width:32px"><circle fill="#EB001B" cx="12" cy="16" r="7"/><circle fill="#F79E1B" cx="20" cy="16" r="7"/><path fill="#FF5F00" d="M16 10.5a7 7 0 0 0-2.5 5.5 7 7 0 0 0 2.5 5.5 7 7 0 0 0 2.5-5.5 7 7 0 0 0-2.5-5.5z"/></svg>`,
  amex: `<svg viewBox="0 0 32 32" style="height:20px;width:32px"><rect fill="#2E77BC" width="32" height="32" rx="4"/><text x="16" y="20" text-anchor="middle" fill="#fff" font-size="10" font-weight="700" font-family="Arial">AMEX</text></svg>`,
};

function PaymentMethodAccordion({
  methods,
  onReady,
  selectedMethod,
  onMethodChange,
  onCardChange,
}: {
  methods: typeof ALL_PAYMENT_METHODS;
  onReady: () => void;
  selectedMethod: PaymentMethod;
  onMethodChange: (m: PaymentMethod) => void;
  onCardChange: (info: CardInfo | null) => void;
}) {
  return (
    <div className="co__methods">
      {methods.map((method) => {
        const isOpen = selectedMethod === method.id;
        return (
          <div key={method.id} className={`co__method${isOpen ? " co__method--active" : ""}`}>
            <button
              type="button"
              className="co__method-header"
              onClick={() => onMethodChange(method.id)}
            >
              <span className="co__method-svg" dangerouslySetInnerHTML={{ __html: method.svg }} />
              <span className="co__method-info">
                <span className="co__method-title">{method.title}</span>
                {method.id === "card" && (
                  <span className="co__method-cards">
                    <img src="https://a0.muscache.com/airbnb/static/packages/assets/frontend/legacy-shared/svgs/payments/logo_visa.0adea522bb26bd90821a8fade4911913.svg" alt="Visa" height="12" />
                    <img src="https://a0.muscache.com/airbnb/static/packages/assets/frontend/legacy-shared/svgs/payments/logo_mastercard.f18379cf1f27d22abd9e9cf44085d149.svg" alt="Mastercard" height="12" />
                    <img src="https://a0.muscache.com/airbnb/static/packages/assets/frontend/legacy-shared/svgs/payments/logo_amex.84088b520ca1b3384cb71398095627da.svg" alt="Amex" height="12" />
                  </span>
                )}
              </span>
              <span className="co__method-radio">
                <span className="co__method-radio-dot" />
              </span>
            </button>
            <div className={`co__method-body${isOpen ? " co__method-body--open" : ""}`}>
              <div className="co__method-inner">
                {method.id === "card" && (
                  <div className="co__card-inputs">
                    <div className="co__card-field">
                      <label className="co__card-label">Kortnummer</label>
                      <div className="co__card-input-wrap">
                        <CardNumberElement
                          options={{ style: CARD_STYLE, showIcon: true, disableLink: true }}
                          onReady={onReady}
                          onChange={(e) => {
                            if (e.complete && e.brand && e.brand !== "unknown") {
                              onCardChange({
                                brand: e.brand,
                                last4: "", // last4 comes from PaymentMethod after confirm
                                funding: (e as unknown as { funding?: string }).funding ?? "unknown",
                              });
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div className="co__card-row">
                      <div className="co__card-field">
                        <label className="co__card-label">Utgångsdatum</label>
                        <div className="co__card-input-wrap">
                          <CardExpiryElement options={{ style: CARD_STYLE }} />
                        </div>
                      </div>
                      <div className="co__card-field">
                        <label className="co__card-label">CVC</label>
                        <div className="co__card-input-wrap">
                          <CardCvcElement options={{ style: CARD_STYLE }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {method.redirectDesc && (
                  <p className="co__method-redirect">
                    {method.redirectDesc}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Step 3: Confirm Button (inside Elements provider) ──────

function ConfirmButton({
  paymentMethod,
  paymentType,
  disabled,
  onSuccess,
  clientSecret,
  onBeforeConfirm,
}: {
  paymentMethod: PaymentMethod;
  paymentType: PaymentType;
  disabled: boolean;
  onSuccess: () => void;
  clientSecret: string | null;
  onBeforeConfirm?: () => Promise<boolean>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returnUrl = typeof window !== "undefined"
    ? `${window.location.origin}/checkout/success`
    : "";

  const handleConfirm = useCallback(async () => {
    if (!stripe || !clientSecret) return;
    setProcessing(true);
    setError(null);

    // Submit guest info before confirming payment
    if (onBeforeConfirm) {
      const ok = await onBeforeConfirm();
      if (!ok) {
        setError("Kunde inte spara gästuppgifter. Försök igen.");
        setProcessing(false);
        return;
      }
    }

    try {
      if (paymentMethod === "card") {
        const cardElement = elements?.getElement(CardNumberElement);
        if (!cardElement) { setError("Kortuppgifter saknas."); setProcessing(false); return; }

        const result = await stripe.confirmCardPayment(clientSecret, {
          payment_method: { card: cardElement },
        });

        if (result.error) { setError(result.error.message ?? "Betalningen misslyckades."); setProcessing(false); }
        else if (result.paymentIntent?.status === "succeeded") onSuccess();
        else setProcessing(false);

      } else if (paymentMethod === "paypal") {
        // PayPal: redirect flow via Stripe
        const result = await stripe.confirmPayPalPayment(clientSecret, {
          return_url: returnUrl,
        });
        if (result.error) { setError(result.error.message ?? "PayPal-betalningen misslyckades."); setProcessing(false); }

      } else if (paymentType === "klarna") {
        // Klarna: redirect flow via Stripe
        const result = await stripe.confirmKlarnaPayment(clientSecret, {
          payment_method: { billing_details: { email: "", address: { country: "SE" } } },
          return_url: returnUrl,
        });
        if (result.error) { setError(result.error.message ?? "Klarna-betalningen misslyckades."); setProcessing(false); }

      } else {
        // Google Pay / Apple Pay — handled via Payment Request API
        // For now, fallback to generic confirm
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Betalningen misslyckades.");
      setProcessing(false);
    }
  }, [stripe, elements, paymentMethod, paymentType, clientSecret, onSuccess, returnUrl, onBeforeConfirm]);

  // Payment Request for Google Pay / Apple Pay
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);

  useEffect(() => {
    if (!stripe || !clientSecret || (paymentMethod !== "gpay" && paymentMethod !== "applepay")) {
      setPaymentRequest(null);
      return;
    }

    const pr = stripe.paymentRequest({
      country: "SE",
      currency: "sek",
      total: { label: "Totalt", amount: 100 }, // Updated by parent — placeholder
      requestPayerName: true,
      requestPayerEmail: true,
    });

    pr.canMakePayment().then((result) => {
      if (result) setPaymentRequest(pr);
    });

    pr.on("paymentmethod", async (ev) => {
      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        { payment_method: ev.paymentMethod.id },
        { handleActions: false },
      );

      if (confirmError) {
        ev.complete("fail");
        setError(confirmError.message ?? "Betalningen misslyckades.");
      } else if (paymentIntent?.status === "succeeded") {
        ev.complete("success");
        onSuccess();
      } else if (paymentIntent?.status === "requires_action") {
        ev.complete("success");
        const { error: actionError } = await stripe.confirmCardPayment(clientSecret);
        if (actionError) setError(actionError.message ?? "Betalningen misslyckades.");
        else onSuccess();
      }
    });
  }, [stripe, clientSecret, paymentMethod, onSuccess]);

  // Branded buttons for non-card methods
  if (paymentMethod === "gpay" || paymentMethod === "applepay") {
    return (
      <>
        {error && <div className="co__payment-error">{error}</div>}
        {paymentRequest ? (
          <PaymentRequestButtonElement
            options={{ paymentRequest, style: { paymentRequestButton: { type: "default", theme: "dark", height: "48px" } } }}
          />
        ) : (
          <button type="button" className="co__confirm-btn" disabled>
            {paymentMethod === "gpay" ? "Google Pay" : "Apple Pay"} ej tillgängligt
          </button>
        )}
      </>
    );
  }

  if (paymentMethod === "paypal") {
    return (
      <>
        {error && <div className="co__payment-error">{error}</div>}
        <button
          type="button"
          className="co__confirm-btn co__confirm-btn--paypal"
          onClick={handleConfirm}
          disabled={disabled || processing || !stripe}
        >
          {processing ? "Behandlar..." : (
            <>
              Betala med <span dangerouslySetInnerHTML={{ __html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" style="height:20px;width:32px;display:inline-block;vertical-align:middle;margin-left:4px"><path fill="#fff" d="m13.26 17.76.02-.1c.1-.34.39-.59.73-.64h2.17c3.36-.07 5.98-1.47 6.85-5.34l.05-.28.07-.36.04-.28.02-.27.02-.26v-.54l-.03-.26-.1-.49c.05.15.07.3.1.45l.02.27.02.25v.32l-.03.26-.06.55c.33.17.63.4.88.68.78.9.93 2.17.64 3.7-.7 3.55-3.02 4.84-6.02 4.9h-.71a.77.77 0 0 0-.74.56l-.03.1-.04.2-.6 3.84-.03.16a.77.77 0 0 1-.66.65h-3.31a.46.46 0 0 1-.46-.45v-.08z"></path><path fill="#fff" opacity=".7" d="M17.6 6c2.13 0 3.8.45 4.71 1.5a3.85 3.85 0 0 1 .63.97c.28.65.36 1.38.25 2.3l-.04.27-.07.36c-.79 4.08-3.46 5.55-6.9 5.61h-2.05c-.4 0-.74.27-.85.65l-.02.1-.93 5.87h-3.8a.53.53 0 0 1-.53-.52v-.09l2.57-16.28c.07-.39.38-.69.77-.73l.1-.01z"></path></svg>` }} />
            </>
          )}
        </button>
      </>
    );
  }

  if (paymentType === "klarna") {
    return (
      <>
        {error && <div className="co__payment-error">{error}</div>}
        <button
          type="button"
          className="co__confirm-btn co__confirm-btn--klarna"
          onClick={handleConfirm}
          disabled={disabled || processing || !stripe}
        >
          {processing ? "Behandlar..." : "Fortsätt till Klarna"}
        </button>
      </>
    );
  }

  // Default: card
  return (
    <>
      {error && <div className="co__payment-error">{error}</div>}
      <button
        type="button"
        className="co__confirm-btn"
        onClick={handleConfirm}
        disabled={disabled || processing || !stripe}
      >
        {processing ? "Behandlar..." : "Bekräfta och betala"}
      </button>
    </>
  );
}

// ── Field error slide ─────────────────────────────────────

function FieldError({ error }: { error?: string }) {
  return (
    <div className={`co__field-slide${error ? " co__field-slide--visible" : ""}`}>
      <div className="co__field-error">{error ?? "\u00A0"}</div>
    </div>
  );
}

// ── Main Checkout ──────────────────────────────────────────

export function CheckoutClient({ product, productSlug, checkIn, checkOut, guests, nights, bookingTerms, header, ratePlanId }: CheckoutProps) {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState<StepId>(1);
  const [visibleStep, setVisibleStep] = useState<StepId>(1); // which body is expanded (lags activeStep for stagger)
  const [leavingStep, setLeavingStep] = useState<StepId | null>(null); // card losing focus
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set());
  const [hasTransitioned, setHasTransitioned] = useState(false); // enables content animation after first step change
  const staggerTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Orchestrated step transition: collapse old while expanding new
  const transitionToStep = useCallback((nextStep: StepId) => {
    if (staggerTimerRef.current) clearTimeout(staggerTimerRef.current);

    if (!hasTransitioned) setHasTransitioned(true);
    setLeavingStep(activeStep);
    setActiveStep(nextStep);
    // Open new step immediately — old collapses at the same time via CSS
    setVisibleStep(nextStep);

    staggerTimerRef.current = setTimeout(() => {
      setLeavingStep(null);
    }, 300);
  }, [activeStep, hasTransitioned]);

  const [paymentType, setPaymentType] = useState<PaymentType>("full");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [cardInfo, setCardInfo] = useState<CardInfo | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  // ── Contact info (step 1) ───────────────────────────────────
  const [contactEmail, setContactEmail] = useState("");
  const [contactCountry, setContactCountry] = useState("SE");
  const [contactFirstName, setContactFirstName] = useState("");
  const [contactLastName, setContactLastName] = useState("");
  const [contactAddress, setContactAddress] = useState("");
  const [contactPostalCode, setContactPostalCode] = useState("");
  const [contactCity, setContactCity] = useState("");
  const [contactTouched, setContactTouched] = useState<Record<string, boolean>>({});
  const addressInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const guestName = `${contactFirstName} ${contactLastName}`.trim();
  const guestEmail = contactEmail;
  const guestPhone = ""; // Phone not collected in this flow

  const [piError, setPiError] = useState<string | null>(null);
  const [priceBreakdownOpen, setPriceBreakdownOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [klarnaInfoOpen, setKlarnaInfoOpen] = useState(false);
  const [paymentReady, setPaymentReady] = useState(false);
  const [availableWallets, setAvailableWallets] = useState<{ gpay: boolean; applepay: boolean }>({ gpay: false, applepay: false });

  // ── Google Places Autocomplete ──────────────────────────────
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !addressInputRef.current) return;
    if (autocompleteRef.current) return; // Already initialized

    // Load Google Maps script if not already loaded
    const scriptId = "google-maps-places";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.onload = () => initAutocomplete();
      document.head.appendChild(script);
    } else if (window.google?.maps?.places) {
      initAutocomplete();
    }

    function initAutocomplete() {
      if (!addressInputRef.current || !window.google?.maps?.places) return;
      const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
        types: ["address"],
        componentRestrictions: { country: contactCountry.toLowerCase() },
        fields: ["address_components", "formatted_address"],
      });
      autocompleteRef.current = ac;
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place.address_components) return;

        let street = "";
        let streetNumber = "";
        let postalCode = "";
        let city = "";

        for (const comp of place.address_components) {
          const t = comp.types[0];
          if (t === "route") street = comp.long_name;
          if (t === "street_number") streetNumber = comp.long_name;
          if (t === "postal_code") postalCode = comp.long_name;
          if (t === "postal_town" || t === "locality") city = comp.long_name;
        }

        setContactAddress(streetNumber ? `${street} ${streetNumber}` : street);
        if (postalCode) setContactPostalCode(postalCode);
        if (city) setContactCity(city);
      });
    }
  }, [contactCountry]);

  // Update autocomplete country restriction when country changes
  useEffect(() => {
    if (autocompleteRef.current) {
      autocompleteRef.current.setComponentRestrictions({
        country: contactCountry.toLowerCase(),
      });
    }
  }, [contactCountry]);

  // ── Contact validation helpers ────────────────────────────────
  const contactErrors: Record<string, string> = {};
  if (contactTouched.email && !contactEmail) contactErrors.email = "E-post krävs";
  else if (contactTouched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) contactErrors.email = "Ogiltig e-postadress";
  if (contactTouched.firstName && !contactFirstName.trim()) contactErrors.firstName = "Förnamn krävs";
  if (contactTouched.lastName && !contactLastName.trim()) contactErrors.lastName = "Efternamn krävs";
  if (contactTouched.address && !contactAddress.trim()) contactErrors.address = "Adress krävs";
  if (contactTouched.postalCode && !contactPostalCode.trim()) contactErrors.postalCode = "Postnummer krävs";
  if (contactTouched.city && !contactCity.trim()) contactErrors.city = "Stad krävs";

  const contactValid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) &&
    contactFirstName.trim().length > 0 &&
    contactLastName.trim().length > 0 &&
    contactAddress.trim().length > 0 &&
    contactPostalCode.trim().length > 0 &&
    contactCity.trim().length > 0;

  // Detect available wallets on mount via Stripe PaymentRequest
  useEffect(() => {
    if (!stripePromise) return;
    stripePromise.then((stripe) => {
      if (!stripe) return;
      const pr = stripe.paymentRequest({
        country: "SE",
        currency: "sek",
        total: { label: "Check", amount: 100 },
      });
      pr.canMakePayment().then((result) => {
        if (result) {
          setAvailableWallets({
            gpay: !!result.googlePay,
            applepay: !!result.applePay,
          });
        }
      });
    });
  }, []);

  // Filter payment methods based on wallet availability
  const paymentMethods = ALL_PAYMENT_METHODS.filter((m) => {
    if (m.id === "gpay") return availableWallets.gpay;
    if (m.id === "applepay") return availableWallets.applepay;
    return true;
  });

  // Create Order + PaymentIntent after step 2 (payment type choice) is completed
  // Step 1 = contact, Step 2 = payment type, Step 3 = payment method, Step 4 = review
  useEffect(() => {
    if (!clientSecret && orderId) return;
    if (clientSecret || !product || !checkIn || !checkOut) return;
    if (!completedSteps.has(2 as StepId)) return;

    setPiError(null);
    fetch("/api/checkout/payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productSlug,
        checkIn,
        checkOut,
        guests,
        ratePlanId: ratePlanId ?? null,
        paymentType,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setPiError(data.message ?? "Kunde inte skapa betalning.");
          return;
        }
        if (data.clientSecret) setClientSecret(data.clientSecret);
        if (data.orderId) setOrderId(data.orderId);
      })
      .catch(() => setPiError("Nätverksfel — försök igen."));
  }, [completedSteps, clientSecret, orderId, product, productSlug, checkIn, checkOut, guests, ratePlanId, paymentType]);

  const handleNext = (step: StepId) => {
    setCompletedSteps((prev) => new Set(prev).add(step));
    if (step < 4) transitionToStep((step + 1) as StepId);
  };

  const handleEdit = (step: StepId) => {
    transitionToStep(step);
  };

  const handlePaymentSuccess = () => {
    if (orderId) {
      router.push(`/checkout/success?orderId=${orderId}`);
    }
  };

  // Submit guest info before payment confirmation
  const submitGuestInfo = async (): Promise<boolean> => {
    if (!orderId || !guestName || !guestEmail) return false;
    try {
      const res = await fetch("/api/checkout/update-guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, guestName, guestEmail, guestPhone: guestPhone || undefined }),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const getStepSummary = (stepId: StepId): React.ReactNode | null => {
    if (!completedSteps.has(stepId)) return null;
    switch (stepId) {
      case 1:
        return contactEmail ? `${contactFirstName} ${contactLastName} · ${contactEmail}` : null;
      case 2:
        return paymentType === "full"
          ? `Betala ${product ? `${formatPriceDisplay(product.price, product.currency)} kr` : "—"} nu`
          : "Betala över tid med Klarna";
      case 3: {
        if (paymentMethod === "card" && cardInfo) {
          const brandSvg = BRAND_SVGS[cardInfo.brand] ?? null;
          const brandLabel = cardInfo.brand.charAt(0).toUpperCase() + cardInfo.brand.slice(1);
          return (
            <span className="co__step-summary-card">
              {brandSvg && <span dangerouslySetInnerHTML={{ __html: brandSvg }} />}
              <span>{brandLabel}</span>
            </span>
          );
        }
        const method = ALL_PAYMENT_METHODS.find((m) => m.id === paymentMethod);
        if (!method) return null;
        return (
          <span className="co__step-summary-method">
            <span dangerouslySetInnerHTML={{ __html: method.svg }} />
            <span>{method.title}</span>
          </span>
        );
      }
      default:
        return null;
    }
  };

  const STEP_TITLES: Record<StepId, string> = {
    1: "Kontaktuppgifter",
    2: "Välj hur du vill betala",
    3: "Lägg till betalningsmetod",
    4: "Granska din bokning",
  };


  const markTouched = (field: string) => setContactTouched((p) => ({ ...p, [field]: true }));


  const COUNTRIES = [
    { code: "SE", name: "Sverige" }, { code: "NO", name: "Norge" }, { code: "DK", name: "Danmark" },
    { code: "FI", name: "Finland" }, { code: "DE", name: "Tyskland" }, { code: "GB", name: "Storbritannien" },
    { code: "NL", name: "Nederländerna" }, { code: "FR", name: "Frankrike" }, { code: "ES", name: "Spanien" },
    { code: "IT", name: "Italien" }, { code: "AT", name: "Österrike" }, { code: "CH", name: "Schweiz" },
    { code: "PL", name: "Polen" }, { code: "BE", name: "Belgien" }, { code: "PT", name: "Portugal" },
    { code: "US", name: "USA" }, { code: "CA", name: "Kanada" },
  ];

  const renderStepContent = (stepId: StepId) => {
    switch (stepId) {
      case 1:
        return (
          <>
            <div className="co__contact-form">
              {/* Email */}
              <div className="co__contact-field">
                <label className="co__card-label">E-postadress</label>
                <input
                  type="email"
                  className={`co__guest-input${contactErrors.email ? " co__guest-input--error" : ""}`}
                  placeholder="din@email.se"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  onBlur={() => markTouched("email")}
                  autoComplete="email"
                />
                <FieldError error={contactErrors.email} />
              </div>

              {/* Country */}
              <div className="co__contact-field">
                <label className="co__card-label">Land</label>
                <div className="co__select-wrap">
                  <select
                    className="co__guest-select"
                    value={contactCountry}
                    onChange={(e) => setContactCountry(e.target.value)}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                  <span className="material-symbols-rounded co__select-chevron">expand_more</span>
                </div>
              </div>

              {/* First + Last name */}
              <div className="co__contact-row">
                <div className="co__contact-field">
                  <label className="co__card-label">Förnamn</label>
                  <input
                    type="text"
                    className={`co__guest-input${contactErrors.firstName ? " co__guest-input--error" : ""}`}
                    placeholder="Anna"
                    value={contactFirstName}
                    onChange={(e) => setContactFirstName(e.target.value)}
                    onBlur={() => markTouched("firstName")}
                    autoComplete="given-name"
                  />
                  <FieldError error={contactErrors.firstName} />
                </div>
                <div className="co__contact-field">
                  <label className="co__card-label">Efternamn</label>
                  <input
                    type="text"
                    className={`co__guest-input${contactErrors.lastName ? " co__guest-input--error" : ""}`}
                    placeholder="Andersson"
                    value={contactLastName}
                    onChange={(e) => setContactLastName(e.target.value)}
                    onBlur={() => markTouched("lastName")}
                    autoComplete="family-name"
                  />
                  <FieldError error={contactErrors.lastName} />
                </div>
              </div>

              {/* Address with Google autocomplete */}
              <div className="co__contact-field">
                <label className="co__card-label">Adress</label>
                <div className="co__address-wrap">
                  <input
                    ref={addressInputRef}
                    type="text"
                    className={`co__guest-input co__guest-input--address${contactErrors.address ? " co__guest-input--error" : ""}`}
                    placeholder="Sök din adress..."
                    value={contactAddress}
                    onChange={(e) => setContactAddress(e.target.value)}
                    onBlur={() => markTouched("address")}
                    autoComplete="street-address"
                  />
                  <span className="co__address-icon material-symbols-rounded">search</span>
                </div>
                <FieldError error={contactErrors.address} />
              </div>

              {/* Postal code + City */}
              <div className="co__contact-row">
                <div className="co__contact-field">
                  <label className="co__card-label">Postnummer</label>
                  <input
                    type="text"
                    className={`co__guest-input${contactErrors.postalCode ? " co__guest-input--error" : ""}`}
                    placeholder="123 45"
                    value={contactPostalCode}
                    onChange={(e) => setContactPostalCode(e.target.value)}
                    onBlur={() => markTouched("postalCode")}
                    autoComplete="postal-code"
                  />
                  <FieldError error={contactErrors.postalCode} />
                </div>
                <div className="co__contact-field">
                  <label className="co__card-label">Stad</label>
                  <input
                    type="text"
                    className={`co__guest-input${contactErrors.city ? " co__guest-input--error" : ""}`}
                    placeholder="Stockholm"
                    value={contactCity}
                    onChange={(e) => setContactCity(e.target.value)}
                    onBlur={() => markTouched("city")}
                    autoComplete="address-level2"
                  />
                  <FieldError error={contactErrors.city} />
                </div>
              </div>
            </div>
            <div className="co__step-footer">
              <button type="button" className="co__next-btn" disabled={!contactValid} onClick={() => handleNext(1)}>Nästa</button>
            </div>
          </>
        );

      case 2:
        return (
          <>
            <div className="co__methods">
              {([
                { id: "full" as PaymentType, title: `Betala ${product ? `${formatPriceDisplay(product.price, product.currency)} kr` : "—"} nu` },
                { id: "klarna" as PaymentType, title: "Betala över tid med Klarna", desc: "Välj ett flexibelt betalningsalternativ som fungerar för dig." },
              ]).map((opt) => {
                const isActive = paymentType === opt.id;
                return (
                  <div key={opt.id} className={`co__method${isActive ? " co__method--active" : ""}`}>
                    <button
                      type="button"
                      className="co__method-header"
                      onClick={() => { setPaymentType(opt.id); setClientSecret(null); }}
                    >
                      <span className="co__method-info">
                        <span className="co__method-title">{opt.title}</span>
                        {opt.desc && <span className="co__method-desc">{opt.desc}</span>}
                        {opt.id === "klarna" && (
                          <span
                            className="co__method-more"
                            onClick={(e) => { e.stopPropagation(); setKlarnaInfoOpen(true); }}
                          >
                            Mer information
                          </span>
                        )}
                      </span>
                      <span className="co__method-radio">
                        <span className="co__method-radio-dot" />
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="co__step-footer">
              <button type="button" className="co__next-btn" onClick={() => handleNext(2)}>Nästa</button>
            </div>
          </>
        );

      case 3:
        return paymentType === "klarna" ? (
          <>
            <div className="co__klarna-step2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://res.cloudinary.com/dmgmoisae/image/upload/v1774386014/klarna_black.d9f77175f9bc7a0600aef2215118c7f5_gnatss.svg"
                alt="Klarna"
                className="co__klarna-step2-logo"
              />
              <p className="co__klarna-step2-legal">
                Genom att fortsätta godkänner du{" "}
                <a href="https://cdn.klarna.com/1.0/shared/content/legal/terms/0/sv_se/user" target="_blank" rel="noopener noreferrer">Klarnas köpvillkor</a>
                {" "}och bekräftar att du har läst{" "}
                <a href="https://cdn.klarna.com/1.0/shared/content/legal/terms/0/sv_se/privacy" target="_blank" rel="noopener noreferrer">Klarnas sekretessmeddelande</a>
                {" "}och{" "}
                <a href="https://cdn.klarna.com/1.0/shared/content/legal/terms/0/sv_se/cookie_purchase" target="_blank" rel="noopener noreferrer">Klarnas cookie-meddelande</a>.
              </p>
            </div>
            <div className="co__step-footer">
              <button type="button" className="co__next-btn" onClick={() => handleNext(3)}>
                Nästa
              </button>
            </div>
          </>
        ) : (
          <>
            {clientSecret ? (
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <PaymentMethodAccordion
                  methods={paymentMethods}
                  onReady={() => setPaymentReady(true)}
                  selectedMethod={paymentMethod}
                  onMethodChange={setPaymentMethod}
                  onCardChange={setCardInfo}
                />
              </Elements>
            ) : (
              <div className="co__payment-skeleton">
                <div className="co__skel-method" />
                <div className="co__skel-method" />
                <div className="co__skel-method" />
              </div>
            )}
            <div className="co__step-footer">
              <button type="button" className="co__next-btn" onClick={() => handleNext(3)}>
                Nästa
              </button>
            </div>
          </>
        );

      case 4:
        return (
          <>
            <p className="co__terms">
              Genom att trycka på knappen godkänner jag dessa{" "}
              <button type="button" className="co__terms-link" onClick={() => setTermsOpen(true)}>
                bokningsvillkor
              </button>.
            </p>
            {clientSecret ? (
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <ConfirmButton
                  paymentMethod={paymentMethod}
                  paymentType={paymentType}
                  disabled={false}
                  onSuccess={handlePaymentSuccess}
                  clientSecret={clientSecret}
                  onBeforeConfirm={submitGuestInfo}
                />
              </Elements>
            ) : (
              <button type="button" className="co__confirm-btn" disabled>
                Bekräfta och betala
              </button>
            )}
          </>
        );
    }
  };

  return (
    <>
    {/* ── Checkout header ──────────────────────────── */}
    <header className="co-header">
      <div className="co-header__inner">
        <a href="/" className="co-header__logo">
          {header.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={header.logoUrl} alt="Logo" style={{ width: header.logoWidth, height: "auto" }} />
          ) : (
            <div className="co-header__logo-placeholder" style={{ width: header.logoWidth }} />
          )}
        </a>
        <span
          className="material-symbols-rounded"
          style={{ fontSize: 23, color: "#1a1a1a", fontVariationSettings: "'wght' 300" }}
        >
          shopping_bag
        </span>
      </div>
    </header>

    <div className="co">
      {/* Column 1: Back button */}
      <div className="co__back-col">
        <button type="button" className="co__back-btn" onClick={() => router.back()} aria-label="Tillbaka">
          <span className="material-symbols-rounded" style={{ fontSize: 20 }}>arrow_back</span>
        </button>
      </div>

      {/* Column 2: Main */}
      <div className="co__main-col">
        <h1 className="co__title">Bekräfta och betala</h1>

        <div className="co__steps">
          {([1, 2, 3, 4] as StepId[]).map((stepId) => {
            const isActive = activeStep === stepId;
            const isBodyOpen = visibleStep === stepId;
            const isLeaving = leavingStep === stepId;
            const isCompleted = completedSteps.has(stepId) && !isActive;
            const summary = getStepSummary(stepId);
            const showSummary = isCompleted && summary;

            return (
              <div
                key={stepId}
                className={[
                  "co__step",
                  isActive && !isLeaving ? "co__step--active" : "",
                  isLeaving ? "co__step--leaving" : "",
                ].filter(Boolean).join(" ")}
              >
                <div className="co__step-header">
                  <div className="co__step-header-left">
                    <div className="co__step-title">{stepId}. {STEP_TITLES[stepId]}</div>
                    <div className={`co__step-summary${showSummary ? " co__step-summary--visible" : ""}`}>
                      <div className="co__step-summary-inner">
                        {summary ?? "\u00A0"}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`co__step-edit${isCompleted ? " co__step-edit--visible" : ""}`}
                    onClick={() => handleEdit(stepId)}
                    tabIndex={isCompleted ? 0 : -1}
                  >
                    Ändra
                  </button>
                </div>

                <div className={`co__step-body${isBodyOpen ? " co__step-body--open" : ""}`}>
                  <div className="co__step-inner">
                    <div className="co__step-content" {...(hasTransitioned ? { "data-animate": "" } : {})}>
                      {renderStepContent(stepId)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Column 3: Summary */}
      <div className="co__summary-col">
        <div className="co__summary">
          {/* Product header */}
          <div className="co__summary-header">
            {product?.image && (
              <img src={product.image} alt={product?.title ?? ""} className="co__summary-image" />
            )}
            <h3 className="co__summary-title">{product?.title ?? "Boende"}</h3>
          </div>

          <div className="co__summary-divider" />

          {/* Datum */}
          <div className="co__summary-section">
            <span className="co__summary-label">Datum</span>
            <span className="co__summary-value">
              {checkIn && checkOut
                ? `${format(parseISO(checkIn), "EEE d", { locale: sv })} – ${format(parseISO(checkOut), "EEE d MMM", { locale: sv })}`
                : "—"}
            </span>
          </div>

          <div className="co__summary-divider" />

          {/* Gäster */}
          <div className="co__summary-section">
            <span className="co__summary-label">Gäster</span>
            <span className="co__summary-value">{guests} {guests === 1 ? "vuxen" : "vuxna"}</span>
          </div>

          <div className="co__summary-divider" />

          {/* Prisuppgifter */}
          {product && nights != null && nights > 0 && (() => {
            const nightlyPrice = Math.round(product.price / nights);
            return (
              <>
                <div className="co__summary-price-row">
                  <span>{nights} nätter x {formatPriceDisplay(nightlyPrice, product.currency)} kr</span>
                  <span>{formatPriceDisplay(product.price, product.currency)} kr</span>
                </div>
              </>
            );
          })()}

          <div className="co__summary-divider" />

          {/* Totalt */}
          <div className="co__summary-row co__summary-row--total">
            <span>Totalt <span style={{ fontWeight: 400, fontSize: "0.75rem", color: "#888" }}>(inkl. moms)</span></span>
            <span>{product ? `${formatPriceDisplay(product.price, product.currency)} kr` : "—"}</span>
          </div>

          {/* Prisspecifikation */}
          <button
            type="button"
            className="co__summary-breakdown-btn"
            onClick={() => setPriceBreakdownOpen(true)}
          >
            Prisspecifikation
          </button>
        </div>
      </div>

      {/* Prisspecifikation modal */}
      {product && nights != null && nights > 0 && (() => {
        const nightlyPrice = Math.round(product.price / nights);
        return (
          <CheckoutModal
            open={priceBreakdownOpen}
            onClose={() => setPriceBreakdownOpen(false)}
            title="Prisspecifikation"
          >
            <div className="co__breakdown">
              <div className="co__breakdown-row">
                <span>{nights} nätter · {checkIn && checkOut ? `${format(parseISO(checkIn), "d", { locale: sv })}–${format(parseISO(checkOut), "d MMM", { locale: sv })}` : ""}</span>
                <span>{formatPriceDisplay(product.price, product.currency)} kr</span>
              </div>
              <div className="co__breakdown-divider" />
              <div className="co__breakdown-row co__breakdown-row--total">
                <div>
                  <div>Totalt <span style={{ fontWeight: 400, fontSize: "0.75rem" }}>(inkl. moms)</span></div>
                  <div className="co__breakdown-currency">{product.currency}</div>
                </div>
                <span>{formatPriceDisplay(product.price, product.currency)} kr</span>
              </div>
            </div>
          </CheckoutModal>
        );
      })()}

      {/* Bokningsvillkor modal */}
      <CheckoutModal
        open={termsOpen}
        onClose={() => setTermsOpen(false)}
        title="Bokningsvillkor"
      >
        {bookingTerms ? (
          <div className="co__terms-content" dangerouslySetInnerHTML={{ __html: bookingTerms }} />
        ) : (
          <div className="co__terms-content">
            <p>Genom att genomföra denna bokning godkänner du följande villkor:</p>
            <ul>
              <li>Bokningen är bindande efter genomförd betalning.</li>
              <li>Avbokning och ändringar sker enligt anläggningens avbokningspolicy.</li>
              <li>Incheckning och utcheckning sker enligt anläggningens angivna tider.</li>
              <li>Anläggningen förbehåller sig rätten att debitera för skador som uppstår under vistelsen.</li>
            </ul>
          </div>
        )}
      </CheckoutModal>

      {/* Klarna info modal */}
      <CheckoutModal
        open={klarnaInfoOpen}
        onClose={() => setKlarnaInfoOpen(false)}
        title="Betala över tid"
      >
        <div className="co__klarna-modal">
          <p className="co__klarna-modal-desc">
            Välj ett av Klarnas flexibla betalningsalternativ, som till exempel att dela upp din kostnad i mindre betalningar eller betala hela summan senare.
          </p>
          <div className="co__klarna-modal-divider" />
          <p className="co__klarna-modal-legal">
            Kredit tillhandahålls av Klarna Bank AB. Klarnas villkor gäller.
          </p>
        </div>
      </CheckoutModal>
    </div>
    </>
  );
}
