"use client";

/**
 * Gift Card Purchase Flow — Client Component
 * ════════════════════════════════════════════
 *
 * 4-step single-page purchase flow for a specific gift card product.
 * All product data is server-resolved (props) — client never fetches products.
 *
 * Steps:
 *   1. Design & Amount — select visual template + amount
 *   2. Recipient — name, email, personal message
 *   3. Delivery & Review — send now or schedule, full summary
 *   4. Payment — Stripe Elements, confirm, redirect to /confirmation
 */

import { useState, useCallback, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { LoadingScreen } from "@/app/_components/Loading";
import type { GiftCardProductData, GiftCardDesignClientData } from "./page";
import "../gift-card.css";
import "@/app/(guest)/checkout/checkout.css";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
);

// ── FieldError (exact same as checkout) ─────────────────────────

function FieldError({ error }: { error?: string }) {
  return (
    <div className={`co__field-slide${error ? " co__field-slide--visible" : ""}`}>
      <div className="co__field-error">{error ?? "\u00A0"}</div>
    </div>
  );
}

type Step = 1 | 2 | 3 | 4;

const PRESET_AMOUNTS = [50000, 100000, 250000, 500000];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// ── Design preview card ─────────────────────────────────────────

function DesignCard({
  design,
  selected,
  onClick,
}: {
  design: GiftCardDesignClientData;
  selected: boolean;
  onClick: () => void;
}) {
  const { config } = design;
  const bgStyle: React.CSSProperties =
    config.bgMode === "gradient"
      ? { background: `linear-gradient(to ${config.bgGradientDir === "up" ? "top" : "bottom"}, ${config.bgColor}, ${config.bgGradientColor2})` }
      : config.bgMode === "image" && design.imageUrl
        ? { backgroundImage: `url(${design.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
        : { background: config.bgColor };

  return (
    <button type="button" className={`gc-design${selected ? " gc-design--selected" : ""}`} onClick={onClick}>
      <div className="gc-design__preview" style={{ ...bgStyle, aspectRatio: "520/331", borderRadius: 10, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {config.logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={config.logoUrl} alt="" style={{ maxWidth: "50%", maxHeight: "35%", objectFit: "contain", position: "relative", zIndex: 1 }} />
        )}
      </div>
      <div className="gc-design__name">{design.name}</div>
      <span className="gc-design__check">
        <span className="material-symbols-rounded" style={{ fontSize: 14 }}>check</span>
      </span>
    </button>
  );
}

// ── Payment form (inside Elements provider) ─────────────────────

function PaymentForm({
  amount,
  processing,
  error,
  onBack,
}: {
  amount: number;
  processing: boolean;
  error: string | null;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    setLocalError(null);

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/shop/gift-cards/confirmation`,
      },
    });

    if (stripeError) {
      setLocalError(stripeError.message ?? "Betalningen misslyckades.");
    }
  };

  const displayError = localError ?? error;

  return (
    <>
      <h2 className="gc-step-title">Betalning</h2>
      <div className="gc-stripe">
        <PaymentElement />
      </div>
      {displayError && <div className="gc-stripe-error">{displayError}</div>}
      <div className="gc-actions">
        <button type="button" className="gc-btn gc-btn--back" onClick={onBack} disabled={processing}>
          <span className="material-symbols-rounded" style={{ fontSize: 20 }}>arrow_back</span>
        </button>
        <button type="button" className="gc-btn gc-btn--primary" onClick={handleSubmit} disabled={processing || !stripe}>
          {processing ? "Behandlar..." : `Betala ${formatPriceDisplay(amount, "SEK")} kr`}
        </button>
      </div>
    </>
  );
}

// ── Main purchase flow ──────────────────────────────────────────

export function GiftCardPurchaseClient({ product }: { product: GiftCardProductData }) {
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [selectedDesign, setSelectedDesign] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");

  // Step 2
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Step 3
  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Step 4
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [piError, setPiError] = useState<string | null>(null);
  const [piLoading, setPiLoading] = useState(false);

  useEffect(() => { setReady(true); }, []);

  const handleBlur = useCallback((field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const handlePresetAmount = useCallback((a: number) => {
    setAmount(a);
    setCustomAmount("");
  }, []);

  const handleCustomAmount = useCallback((val: string) => {
    setCustomAmount(val);
    const kr = parseInt(val, 10);
    setAmount(!isNaN(kr) && kr > 0 ? kr * 100 : null);
  }, []);

  const selectedDesignData = product.designs.find((d) => d.id === selectedDesign) ?? null;

  // Validation
  const step1Valid = selectedDesign !== null && amount !== null && amount >= product.minAmount && amount <= product.maxAmount;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail);
  const step2Valid = recipientName.trim().length > 0 && emailValid && senderName.trim().length > 0;
  const today = new Date().toISOString().split("T")[0];
  const maxDate = new Date(Date.now() + 365 * 86400000).toISOString().split("T")[0];
  const step3Valid = scheduledDate >= today;

  // Create PaymentIntent
  const enterPayment = useCallback(async () => {
    if (clientSecret) { setStep(4); return; }

    setPiError(null);
    setPiLoading(true);

    const scheduledAt = scheduledDate === today
      ? new Date().toISOString()
      : new Date(scheduledDate + "T09:00:00Z").toISOString();

    try {
      const res = await fetch("/api/checkout/purchase-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId: selectedDesign,
          amount,
          recipientEmail,
          recipientName,
          senderName,
          message: message || undefined,
          scheduledAt,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msgs: Record<string, string> = {
          GIFT_CARDS_DISABLED: "Presentkort är inte aktiverat.",
          INVALID_AMOUNT: "Beloppet ligger utanför tillåtet intervall.",
          INVALID_DESIGN: "Vald design är inte längre tillgänglig.",
          STRIPE_NOT_CONFIGURED: "Betalning är inte konfigurerad.",
          STRIPE_NOT_ACTIVE: "Betalning är inte aktiverad.",
          RATE_LIMITED: "För många försök. Vänta en stund.",
          PAYMENT_FAILED: data.message ?? "Betalning misslyckades.",
        };
        setPiError(msgs[data.error] ?? data.message ?? "Något gick fel.");
        setPiLoading(false);
        return;
      }

      setClientSecret(data.clientSecret);
      setStep(4);
    } catch {
      setPiError("Nätverksfel — kontrollera din anslutning och försök igen.");
    } finally {
      setPiLoading(false);
    }
  }, [clientSecret, scheduledDate, selectedDesign, amount, recipientEmail, recipientName, senderName, message, today]);

  if (!ready) return <LoadingScreen fixed />;

  // Preview card background
  const previewDesign = selectedDesignData ?? product.designs[0];
  const previewBg: React.CSSProperties = previewDesign
    ? previewDesign.config.bgMode === "gradient"
      ? { background: `linear-gradient(to ${previewDesign.config.bgGradientDir === "up" ? "top" : "bottom"}, ${previewDesign.config.bgColor}, ${previewDesign.config.bgGradientColor2})` }
      : previewDesign.config.bgMode === "image" && previewDesign.imageUrl
        ? { backgroundImage: `url(${previewDesign.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
        : { background: previewDesign.config.bgColor }
    : { background: "#f0f0f0" };

  const allValid = step1Valid && step2Valid && step3Valid;

  return (
    <div className="gc-page">
      <div className="gc-purchase-layout">
        {/* ── Left column: all fields ── */}
        <div className="gc-purchase-left">
          <h1 className="gc-purchase-title">{product.title}</h1>

          {/* Design */}
          <div className="gc-purchase-section">
            <h2 className="gc-step-title">Välj design</h2>
            <div className="gc-designs">
              {product.designs.map((d) => (
                <DesignCard key={d.id} design={d} selected={selectedDesign === d.id} onClick={() => setSelectedDesign(d.id)} />
              ))}
            </div>
          </div>

          {/* Amount */}
          <div className="gc-purchase-section">
            <h2 className="gc-step-title">Välj belopp</h2>
            <div className="co__contact-field">
              <div className="co__float" data-filled="">
                <input
                  type="number"
                  className={`co__float-input gc-custom-amount__field${amount !== null && amount > 0 && (amount < product.minAmount || amount > product.maxAmount) ? " co__float-input--error" : ""}`}
                  placeholder={`Ange ett belopp mellan ${formatPriceDisplay(product.minAmount, "SEK")} och ${formatPriceDisplay(product.maxAmount, "SEK")} kr`}
                  value={customAmount}
                  onChange={(e) => handleCustomAmount(e.target.value)}
                  min={product.minAmount / 100}
                  max={product.maxAmount / 100}
                />
                <span className="co__float-label">Ange eget belopp</span>
                <span className="gc-float-suffix">kr</span>
              </div>
              <FieldError error={amount !== null && amount > 0 && (amount < product.minAmount || amount > product.maxAmount) ? `Beloppet måste vara mellan ${product.minAmount / 100} och ${formatPriceDisplay(product.maxAmount, "SEK")} kr` : undefined} />
            </div>
          </div>

          {/* Recipient */}
          <div className="gc-purchase-section">
            <h2 className="gc-step-title">Vem är det till?</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="co__contact-field">
                <div className="co__float" data-filled={recipientName ? "" : undefined}>
                  <input
                    type="text"
                    className={`co__float-input${touched.recipientName && !recipientName.trim() ? " co__float-input--error" : ""}`}
                    placeholder="Mottagarens namn"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    onBlur={() => handleBlur("recipientName")}
                    autoComplete="off"
                  />
                  <span className="co__float-label">Mottagarens namn</span>
                </div>
                <FieldError error={touched.recipientName && !recipientName.trim() ? "Ange mottagarens namn" : undefined} />
              </div>
              <div className="co__contact-field">
                <div className="co__float" data-filled={recipientEmail ? "" : undefined}>
                  <input
                    type="email"
                    className={`co__float-input${touched.recipientEmail && (!recipientEmail || !emailValid) ? " co__float-input--error" : ""}`}
                    placeholder="Mottagarens e-post"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    onBlur={() => handleBlur("recipientEmail")}
                    autoComplete="email"
                  />
                  <span className="co__float-label">Mottagarens e-post</span>
                </div>
                <FieldError error={touched.recipientEmail && !recipientEmail ? "Ange mottagarens e-post" : touched.recipientEmail && !emailValid ? "Ogiltig e-postadress" : undefined} />
              </div>
            </div>
          </div>

          {/* Message */}
          <div className="gc-purchase-section">
            <h2 className="gc-step-title">Lägg till ett meddelande</h2>
            <textarea
              className="gc-message-textarea"
              placeholder="Skriv ett personligt meddelande..."
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 500))}
              maxLength={500}
            />
          </div>

          {/* Sender */}
          <div className="gc-purchase-section">
            <h2 className="gc-step-title">Vem är det ifrån?</h2>
            <div className="co__contact-field">
              <div className="co__float" data-filled={senderName ? "" : undefined}>
                <input
                  type="text"
                  className={`co__float-input${touched.senderName && !senderName.trim() ? " co__float-input--error" : ""}`}
                  placeholder="Ditt namn"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  onBlur={() => handleBlur("senderName")}
                  autoComplete="name"
                />
                <span className="co__float-label">Ditt namn</span>
              </div>
              <FieldError error={touched.senderName && !senderName.trim() ? "Ange ditt namn" : undefined} />
            </div>
          </div>

          {/* Delivery */}
          <div className="gc-purchase-section">
            <div className="co__contact-field">
              <div className="co__float" data-filled="">
                <input
                  type="date"
                  className="co__float-input gc-date-input"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  min={today}
                  max={maxDate}
                />
                <span className="co__float-label">Utskicksdatum</span>
                <span className="gc-date-display">{scheduledDate === today ? "Idag" : formatDate(scheduledDate)}</span>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="gc-purchase-section">
            {piError && <div className="gc-stripe-error" style={{ marginBottom: 12 }}>{piError}</div>}
            <button type="button" className="gc-btn gc-btn--primary" style={{ width: "100%" }} disabled={!allValid || piLoading} onClick={enterPayment}>
              Lägg i varukorgen
            </button>
          </div>

          {product.description && (
            <div className="gc-product-desc" dangerouslySetInnerHTML={{ __html: product.description }} />
          )}
        </div>

        {/* ── Right column: sticky preview ── */}
        <div className="gc-purchase-right">
          <div className="gc-purchase-preview" style={previewBg}>
            {previewDesign?.config.logoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={previewDesign.config.logoUrl} alt="" className="gc-purchase-preview__logo" />
            )}
            {amount && amount > 0 && (
              <div className="gc-purchase-preview__amount">{formatPriceDisplay(amount, "SEK")} kr</div>
            )}
          </div>
        </div>
      </div>

      {/* Stripe payment modal — overlays when PI is ready */}
      {clientSecret && (
        <div className="gc-payment-overlay">
          <div className="gc-payment-modal">
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
              <PaymentForm amount={amount!} processing={piLoading} error={piError} onBack={() => { setClientSecret(null); }} />
            </Elements>
          </div>
        </div>
      )}
    </div>
  );
}
