"use client";

import { useState, useEffect, useTransition } from "react";
import { EditorIcon } from "@/app/_components/EditorIcon";
import {
  getPaymentStatus,
  startOnboarding,
  disconnectPayments,
  hasActiveProducts,
} from "./actions";
import type { ConnectStatus } from "@/app/_lib/stripe/connect";

type PaymentsContentProps = {
  onSubTitleChange?: (title: string | null) => void;
};

export function PaymentsContent({ onSubTitleChange }: PaymentsContentProps) {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [hasProducts, setHasProducts] = useState(false);

  useEffect(() => {
    onSubTitleChange?.(null);
    Promise.all([getPaymentStatus(), hasActiveProducts()])
      .then(([s, hp]) => {
        setStatus(s);
        setHasProducts(hp);
      })
      .catch(() => setError("Kunde inte hämta betalningsstatus"))
      .finally(() => setLoading(false));
  }, [onSubTitleChange]);

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
      }
    });
  };

  if (loading) {
    return (
      <div style={{ padding: "var(--space-6)", display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <span
          className="material-symbols-rounded"
          style={{
            fontSize: 18,
            color: "var(--admin-text-tertiary)",
            animation: "spin 1s linear infinite",
          }}
        >
          progress_activity
        </span>
        <span style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)" }}>
          Laddar...
        </span>
      </div>
    );
  }

  return (
    <div style={{ padding: "var(--space-6)" }}>
      {/* Warning: products exist but Stripe not connected */}
      {!status?.connected && hasProducts && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            padding: "var(--space-3) var(--space-4)",
            background: "color-mix(in srgb, #d97706 8%, transparent)",
            border: "1px solid color-mix(in srgb, #d97706 20%, transparent)",
            borderRadius: "var(--radius-md)",
            marginBottom: "var(--space-5)",
            fontSize: "var(--font-sm)",
            color: "#92400e",
          }}
        >
          <span
            className="material-symbols-rounded"
            style={{ fontSize: 18, color: "#d97706", flexShrink: 0 }}
          >
            warning
          </span>
          <span>
            Du har aktiva produkter men ingen betalmetod ansluten.
            Kunder kan inte slutföra köp.
          </span>
        </div>
      )}

      {/* Stripe Connect card */}
      <div
        style={{
          border: "1px solid var(--admin-border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "var(--space-5) var(--space-6)",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-4)",
            borderBottom: "1px solid var(--admin-border)",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "var(--radius-md)",
              background: "#635BFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "var(--font-md)", fontWeight: 600, color: "var(--admin-text)" }}>
              Stripe
            </div>
            <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-secondary)", marginTop: 2 }}>
              Betalningslösning för att ta emot kortbetalningar
            </div>
          </div>
          {status?.connected && (
            <span
              style={{
                fontSize: "var(--font-xs)",
                fontWeight: 500,
                padding: "2px 10px",
                borderRadius: "var(--radius-full)",
                background: status.livemode
                  ? "color-mix(in srgb, #16a34a 12%, transparent)"
                  : "color-mix(in srgb, #d97706 12%, transparent)",
                color: status.livemode ? "#16a34a" : "#d97706",
              }}
            >
              {status.livemode ? "Aktivt" : "Testläge"}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: "var(--space-5) var(--space-6)" }}>
          {error && (
            <div
              style={{
                fontSize: "var(--font-sm)",
                color: "var(--admin-danger)",
                marginBottom: "var(--space-4)",
                padding: "var(--space-3) var(--space-4)",
                background: "color-mix(in srgb, var(--admin-danger) 6%, transparent)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              {error}
            </div>
          )}

          {!status?.connected ? (
            /* Not connected state */
            <div>
              <p
                style={{
                  fontSize: "var(--font-sm)",
                  color: "var(--admin-text-secondary)",
                  lineHeight: 1.5,
                  marginBottom: "var(--space-5)",
                }}
              >
                Anslut ditt Stripe-konto för att ta emot betalningar från kunder.
                Du behöver ett Stripe-konto — om du inte har ett kan du skapa ett
                under anslutningsprocessen.
              </p>
              <button
                className="admin-btn admin-btn--accent"
                onClick={handleConnect}
                disabled={isPending}
                style={{ gap: "var(--space-2)" }}
              >
                <EditorIcon name="link" size={16} />
                {isPending ? "Ansluter..." : "Anslut Stripe"}
              </button>
            </div>
          ) : (
            /* Connected state */
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                  <span
                    className="material-symbols-rounded"
                    style={{
                      fontSize: 18,
                      color: "#16a34a",
                      fontVariationSettings: "'FILL' 1, 'wght' 400",
                    }}
                  >
                    check_circle
                  </span>
                  <span style={{ fontSize: "var(--font-sm)", color: "var(--admin-text)" }}>
                    Stripe-konto anslutet
                  </span>
                </div>

                <div
                  style={{
                    fontSize: "var(--font-xs)",
                    color: "var(--admin-text-tertiary)",
                    fontFamily: "var(--sf-mono, monospace)",
                    padding: "var(--space-2) var(--space-3)",
                    background: "var(--admin-surface)",
                    borderRadius: "var(--radius-sm)",
                    display: "inline-flex",
                    alignSelf: "flex-start",
                  }}
                >
                  {status.accountId}
                </div>

                {status.connectedAt && (
                  <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)" }}>
                    Anslutet {new Date(status.connectedAt).toLocaleDateString("sv-SE")}
                  </div>
                )}
              </div>

              {/* Disconnect */}
              {!showDisconnect ? (
                <button
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  onClick={() => setShowDisconnect(true)}
                  style={{
                    color: "var(--admin-text-tertiary)",
                    alignSelf: "flex-start",
                    marginTop: "var(--space-2)",
                  }}
                >
                  Koppla från
                </button>
              ) : (
                <div
                  style={{
                    padding: "var(--space-4)",
                    background: "color-mix(in srgb, var(--admin-danger) 4%, transparent)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid color-mix(in srgb, var(--admin-danger) 15%, transparent)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-3)",
                  }}
                >
                  <p style={{ fontSize: "var(--font-sm)", color: "var(--admin-text)" }}>
                    Är du säker? Kunderna kommer inte kunna genomföra köp om Stripe kopplas från.
                  </p>
                  <div style={{ display: "flex", gap: "var(--space-2)" }}>
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
    </div>
  );
}
