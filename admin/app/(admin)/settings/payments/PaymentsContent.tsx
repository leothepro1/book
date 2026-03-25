"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { EditorIcon } from "@/app/_components/EditorIcon";
import {
  getPaymentStatus,
  startOnboarding,
  disconnectPayments,
  hasActiveProducts,
  getPayoutInfo,
  getRecentPayouts,
  getPaymentMethodConfig,
  togglePaymentMethod,
} from "./actions";
import type { ConnectStatus } from "@/app/_lib/stripe/connect";
import type { PayoutInfo, PayoutItem } from "@/app/_lib/stripe/payouts";
import type { PaymentMethodConfig, PaymentMethodId } from "@/app/_lib/payments/types";
import {
  PAYMENT_METHOD_REGISTRY,
  CATEGORY_LABELS,
  getMethodsByCategory,
} from "@/app/_lib/payments/registry";
import "./payments.css";

// ── Types ───────────────────────────────────────────────────────

type PaymentsContentProps = {
  onSubTitleChange?: (title: string | null) => void;
};

// ── Schedule labels ─────────────────────────────────────────────

const SCHEDULE_LABELS: Record<string, string> = {
  daily: "Daglig",
  weekly: "Veckovis",
  monthly: "Månatlig",
  manual: "Manuell",
};

const PAYOUT_STATUS_LABELS: Record<string, string> = {
  paid: "Utbetald",
  pending: "Väntande",
  in_transit: "Under överföring",
  failed: "Misslyckad",
  canceled: "Avbruten",
};

// ── Component ───────────────────────────────────────────────────

export function PaymentsContent({ onSubTitleChange }: PaymentsContentProps) {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [hasProducts, setHasProducts] = useState(false);

  // Payout state
  const [payoutInfo, setPayoutInfo] = useState<PayoutInfo | null>(null);
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);

  // Payment method config state
  const [methodConfig, setMethodConfig] = useState<PaymentMethodConfig | null>(null);
  const [togglingMethod, setTogglingMethod] = useState<PaymentMethodId | null>(null);

  // ── Load all data ───────────────────────────────────────────
  useEffect(() => {
    onSubTitleChange?.(null);

    Promise.all([getPaymentStatus(), hasActiveProducts(), getPaymentMethodConfig()])
      .then(([s, hp, mc]) => {
        setStatus(s);
        setHasProducts(hp);
        setMethodConfig(mc);

        // Load payout data if connected
        if (s.connected && s.accountId) {
          Promise.all([getPayoutInfo(), getRecentPayouts()]).then(
            ([pi, rp]) => {
              if (pi && !("error" in pi)) setPayoutInfo(pi);
              if (rp && !("error" in rp)) setPayouts(rp);
            },
          );
        }
      })
      .catch(() => setError("Kunde inte hämta betalningsstatus"))
      .finally(() => setLoading(false));
  }, [onSubTitleChange]);

  // ── Handlers ──────────────────────────────────────────────────

  const handleConnect = () => {
    setError(null);
    startTransition(async () => {
      const result = await startOnboarding();
      if ("error" in result) {
        setError(result.error);
      } else {
        window.location.href = result.url;
      }
    });
  };

  const handleDisconnect = () => {
    setError(null);
    startTransition(async () => {
      const result = await disconnectPayments();
      if ("error" in result) {
        setError(result.error);
      } else {
        setStatus({ connected: false, livemode: false, accountId: null, connectedAt: null });
        setShowDisconnect(false);
        setPayoutInfo(null);
        setPayouts([]);
        setMethodConfig(null);
      }
    });
  };

  const handleToggleMethod = useCallback(
    (methodId: PaymentMethodId, enabled: boolean) => {
      // Optimistic update
      setMethodConfig((prev) => {
        if (!prev) return prev;
        return { ...prev, methods: { ...prev.methods, [methodId]: enabled } };
      });
      setTogglingMethod(methodId);

      togglePaymentMethod(methodId, enabled)
        .then((result) => {
          if ("error" in result) {
            // Revert on error
            setMethodConfig((prev) => {
              if (!prev) return prev;
              return { ...prev, methods: { ...prev.methods, [methodId]: !enabled } };
            });
            setError(result.error);
          }
        })
        .finally(() => setTogglingMethod(null));
    },
    [],
  );

  // ── Loading state ─────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: "var(--space-6)", display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <span
          className="material-symbols-rounded"
          style={{ fontSize: 18, color: "var(--admin-text-tertiary)", animation: "spin 1s linear infinite" }}
        >
          progress_activity
        </span>
        <span style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)" }}>
          Laddar...
        </span>
      </div>
    );
  }

  const connected = status?.connected ?? false;
  const dashboardUrl = status?.accountId
    ? `https://dashboard.stripe.com/${status.livemode ? "" : "test/"}` : null;

  return (
    <div style={{ padding: "var(--space-6)" }}>
      {/* ── Warning banner ───────────────────────────────────── */}
      {!connected && hasProducts && (
        <div className="pay-warning pay-warning--amber">
          <span className="material-symbols-rounded pay-warning__icon">warning</span>
          <span>
            Du har aktiva produkter men ingen betalmetod ansluten.
            Kunder kan inte slutföra köp.
          </span>
        </div>
      )}

      {/* ── Error display ────────────────────────────────────── */}
      {error && <div className="pay-error">{error}</div>}

      {/* ── Test mode banner (when connected in test) ────────── */}
      {connected && !status?.livemode && (
        <div className="pay-test-banner" style={{ marginBottom: "var(--space-5)" }}>
          <span className="material-symbols-rounded pay-test-banner__icon">science</span>
          <div>
            <strong>Testläge aktivt</strong> — inga riktiga betalningar behandlas.
            Använd Stripes testkort för att simulera betalningar.
          </div>
        </div>
      )}

      {/* ═══ Section 1: Bedfront Payments ════════════════════ */}
      <div className="pay-section">
        <div className="pay-section__header">
          <div className="pay-section__header-icon pay-section__header-icon--brand">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
            </svg>
          </div>
          <div className="pay-section__header-info">
            <div className="pay-section__header-title">Bedfront Payments</div>
            <div className="pay-section__header-desc">
              Ta emot betalningar via kort, Swish, Klarna och mer
            </div>
          </div>
          {connected && (
            <span className={`pay-badge ${status?.livemode ? "pay-badge--live" : "pay-badge--test"}`}>
              {status?.livemode ? "Aktivt" : "Testläge"}
            </span>
          )}
        </div>

        <div className="pay-section__body">
          {!connected ? (
            <div>
              <p style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)", lineHeight: 1.5, marginBottom: "var(--space-5)" }}>
                Aktivera Bedfront Payments för att ta emot betalningar från kunder.
                Du behöver ett Stripe-konto — om du inte har ett skapas det automatiskt
                under aktiveringen.
              </p>
              <button
                className="admin-btn admin-btn--accent"
                onClick={handleConnect}
                disabled={isPending}
                style={{ gap: "var(--space-2)" }}
              >
                <EditorIcon name="link" size={16} />
                {isPending ? "Aktiverar..." : "Aktivera Bedfront Payments"}
              </button>
            </div>
          ) : (
            <div className="pay-connected">
              <div className="pay-connected__row">
                <span className="material-symbols-rounded pay-connected__check">check_circle</span>
                <span style={{ fontSize: "var(--font-sm)", color: "var(--admin-text)" }}>
                  Bedfront Payments anslutet
                </span>
              </div>

              <div className="pay-connected__account-id">{status?.accountId}</div>

              {status?.connectedAt && (
                <div className="pay-connected__date">
                  Anslutet {new Date(status.connectedAt).toLocaleDateString("sv-SE")}
                </div>
              )}

              {dashboardUrl && (
                <a
                  href={dashboardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pay-link"
                >
                  Hantera i Stripe
                  <span className="material-symbols-rounded pay-link__icon">open_in_new</span>
                </a>
              )}

              {/* Disconnect flow */}
              {!showDisconnect ? (
                <button
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  onClick={() => setShowDisconnect(true)}
                  style={{ color: "var(--admin-text-tertiary)", alignSelf: "flex-start", marginTop: "var(--space-2)" }}
                >
                  Koppla från
                </button>
              ) : (
                <div className="pay-disconnect">
                  <p className="pay-disconnect__text">
                    Är du säker? Kunderna kommer inte kunna genomföra köp om betalningar kopplas från.
                  </p>
                  <div className="pay-disconnect__actions">
                    <button
                      className="admin-btn admin-btn--danger admin-btn--sm"
                      onClick={handleDisconnect}
                      disabled={isPending}
                    >
                      {isPending ? "Kopplar från..." : "Ja, koppla från"}
                    </button>
                    <button
                      className="admin-btn admin-btn--ghost admin-btn--sm"
                      onClick={() => setShowDisconnect(false)}
                      disabled={isPending}
                    >
                      Avbryt
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Only show remaining sections when connected */}
      {connected && (
        <>
          {/* ═══ Section 2: Utbetalningar ══════════════════════ */}
          <PayoutsSection payoutInfo={payoutInfo} dashboardUrl={dashboardUrl} />

          {/* ═══ Section 3: Kontoutdrag ════════════════════════ */}
          <StatementsSection payouts={payouts} dashboardUrl={dashboardUrl} />

          {/* ═══ Section 4: Betalningsmetoder ══════════════════ */}
          <PaymentMethodsSection
            config={methodConfig}
            togglingMethod={togglingMethod}
            onToggle={handleToggleMethod}
          />
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Section 2: Utbetalningar
// ═══════════════════════════════════════════════════════════════

function PayoutsSection({
  payoutInfo,
  dashboardUrl,
}: {
  payoutInfo: PayoutInfo | null;
  dashboardUrl: string | null;
}) {
  return (
    <div className="pay-section">
      <div className="pay-section__header">
        <div className="pay-section__header-icon" style={{ background: "var(--admin-bg)" }}>
          <span className="material-symbols-rounded" style={{ fontSize: 20, color: "var(--admin-text-secondary)" }}>
            account_balance
          </span>
        </div>
        <div className="pay-section__header-info">
          <div className="pay-section__header-title">Utbetalningar</div>
          <div className="pay-section__header-desc">
            Bankkonto och utbetalningsschema
          </div>
        </div>
      </div>

      <div className="pay-section__body">
        {!payoutInfo ? (
          <div className="pay-empty">Laddar utbetalningsinformation...</div>
        ) : (
          <>
            <div className="pay-payout-grid">
              <div className="pay-payout-item">
                <div className="pay-payout-item__label">Bankkonto</div>
                <div className="pay-payout-item__value pay-payout-item__value--mono">
                  {payoutInfo.bankAccount
                    ? `•••• ${payoutInfo.bankAccount.last4}`
                    : "Inget bankkonto anslutet"}
                </div>
                {payoutInfo.bankAccount && (
                  <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", marginTop: 2 }}>
                    {payoutInfo.bankAccount.bankName ?? "Bank"} · {payoutInfo.bankAccount.currency}
                  </div>
                )}
              </div>

              <div className="pay-payout-item">
                <div className="pay-payout-item__label">Utbetalningsschema</div>
                <div className="pay-payout-item__value">
                  {SCHEDULE_LABELS[payoutInfo.schedule.interval] ?? payoutInfo.schedule.interval}
                </div>
                <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", marginTop: 2 }}>
                  {payoutInfo.schedule.delayDays} dagars fördröjning
                </div>
              </div>
            </div>

            {dashboardUrl && (
              <a
                href={`${dashboardUrl}settings/payouts`}
                target="_blank"
                rel="noopener noreferrer"
                className="pay-link"
              >
                Hantera bankkonto i Stripe
                <span className="material-symbols-rounded pay-link__icon">open_in_new</span>
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Section 3: Kontoutdrag
// ═══════════════════════════════════════════════════════════════

function StatementsSection({
  payouts,
  dashboardUrl,
}: {
  payouts: PayoutItem[];
  dashboardUrl: string | null;
}) {
  return (
    <div className="pay-section">
      <div className="pay-section__header">
        <div className="pay-section__header-icon" style={{ background: "var(--admin-bg)" }}>
          <span className="material-symbols-rounded" style={{ fontSize: 20, color: "var(--admin-text-secondary)" }}>
            receipt_long
          </span>
        </div>
        <div className="pay-section__header-info">
          <div className="pay-section__header-title">Kontoutdrag</div>
          <div className="pay-section__header-desc">
            Senaste utbetalningar till ditt bankkonto
          </div>
        </div>
      </div>

      <div className="pay-section__body pay-section__body--flush">
        {payouts.length === 0 ? (
          <div className="pay-empty">Inga utbetalningar ännu</div>
        ) : (
          <div className="pay-statement-list">
            {payouts.map((p) => (
              <div key={p.id} className="pay-statement-row">
                <div className="pay-statement-row__amount">
                  {formatAmount(p.amount, p.currency)}
                </div>
                <span className={`pay-statement-row__status pay-statement-row__status--${p.status}`}>
                  {PAYOUT_STATUS_LABELS[p.status] ?? p.status}
                </span>
                <div className="pay-statement-row__date">
                  {new Date(p.arrivalDate * 1000).toLocaleDateString("sv-SE")}
                </div>
              </div>
            ))}
          </div>
        )}

        {dashboardUrl && payouts.length > 0 && (
          <div style={{ padding: "var(--space-3) var(--space-6) var(--space-4)" }}>
            <a
              href={`${dashboardUrl}payouts`}
              target="_blank"
              rel="noopener noreferrer"
              className="pay-link"
            >
              Visa alla i Stripe
              <span className="material-symbols-rounded pay-link__icon">open_in_new</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Section 4: Betalningsmetoder
// ═══════════════════════════════════════════════════════════════

function PaymentMethodsSection({
  config,
  togglingMethod,
  onToggle,
}: {
  config: PaymentMethodConfig | null;
  togglingMethod: PaymentMethodId | null;
  onToggle: (methodId: PaymentMethodId, enabled: boolean) => void;
}) {
  const groups = getMethodsByCategory();

  return (
    <div className="pay-section">
      <div className="pay-section__header">
        <div className="pay-section__header-icon" style={{ background: "var(--admin-bg)" }}>
          <span className="material-symbols-rounded" style={{ fontSize: 20, color: "var(--admin-text-secondary)" }}>
            credit_card
          </span>
        </div>
        <div className="pay-section__header-info">
          <div className="pay-section__header-title">Betalningsmetoder</div>
          <div className="pay-section__header-desc">
            Välj vilka betalningsmetoder dina kunder kan använda
          </div>
        </div>
      </div>

      <div className="pay-section__body pay-section__body--flush">
        <div className="pay-method-list">
          {Array.from(groups.entries()).map(([category, methods]) => (
            <div key={category}>
              <div className="pay-category-label">
                {CATEGORY_LABELS[category] ?? category}
              </div>
              {methods.map((def) => {
                const isEnabled = def.alwaysOn || (config?.methods[def.id] ?? def.defaultEnabled);
                const isToggling = togglingMethod === def.id;

                return (
                  <div key={def.id} className="pay-method-row">
                    <div
                      className="pay-method-row__icon"
                      dangerouslySetInnerHTML={{ __html: def.svgIcon ?? "" }}
                    />
                    <div className="pay-method-row__info">
                      <div className="pay-method-row__name">{def.name}</div>
                      <div className="pay-method-row__desc">{def.description}</div>
                    </div>
                    <div className="pay-method-row__toggle">
                      {def.alwaysOn && (
                        <span className="pay-method-row__always-on">Alltid aktiv</span>
                      )}
                      <button
                        className={`admin-toggle${isEnabled ? " admin-toggle-on" : ""}`}
                        onClick={() => onToggle(def.id, !isEnabled)}
                        disabled={def.alwaysOn || isToggling}
                        aria-label={`${isEnabled ? "Avaktivera" : "Aktivera"} ${def.name}`}
                        style={def.alwaysOn ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                      >
                        <span className="admin-toggle-thumb" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

function formatAmount(amount: number, currency: string): string {
  // Stripe amounts are in smallest unit (ören/cents)
  const major = amount / 100;
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(major);
}
