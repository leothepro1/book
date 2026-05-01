"use client";

/**
 * Phase G — webhook-race resolution UI for `/checkout/success?draftSession=…`.
 *
 * Stripe's `confirmPayment` returns synchronously to the buyer's
 * client; the Order is created server-side by the Phase H webhook.
 * Between those two events, the buyer is on this page and we don't
 * yet have a `completedOrderId` to redirect to the canonical receipt.
 *
 * Polls `/api/checkout/session-status` at 3s cadence. Resolves on:
 *   - status === "PAID" && completedOrderId !== null   → redirect to /invoice/{token}
 *   - status in (UNLINKED, EXPIRED, CANCELLED)         → redirect to /invoice/{token}
 *
 * Hard cap: 60s of polling without resolution → render the
 * "tar längre tid än vanligt" message + manual reload button.
 * Sentry breadcrumb fires via the timeout state — operators see
 * `draft_invoice.success_page_timeout` indirectly via the unresolved
 * page hits.
 */

import { useEffect, useRef, useState } from "react";

import { Loading } from "@/app/_components/Loading";

const POLL_INTERVAL_MS = 3_000;
const TIMEOUT_MS = 60_000;

interface SessionStatusPayload {
  status: "ACTIVE" | "UNLINKED" | "EXPIRED" | "PAID" | "CANCELLED";
  lastBuyerActivityAt: string | null;
  completedOrderId: string | null;
  shareLinkToken: string;
}

interface ProcessingStateProps {
  draftSessionId: string;
  /** Initial token from SSR. Used as the redirect target if polling
   *  resolves to a terminal state; the response from session-status
   *  may also carry an updated token (it shouldn't change but defence
   *  in depth). */
  shareLinkToken: string;
  /** Absolute base URL for the tenant portal (e.g.
   *  `https://apelviken-dev-x.rutgr.com`). Built server-side via
   *  `getTenantUrl`; the client uses it to build the receipt redirect
   *  without re-resolving the host. */
  portalBaseUrl: string;
}

export function ProcessingState({
  draftSessionId,
  shareLinkToken,
  portalBaseUrl,
}: ProcessingStateProps) {
  const [timedOut, setTimedOut] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const redirectedRef = useRef(false);

  useEffect(() => {
    // Initialise the start timestamp inside the effect — calling
    // Date.now() during render is impure and the React-hooks-purity
    // lint catches it. Inside an effect the call is ordered relative
    // to mount, which is what we actually want for the 60s cap.
    if (startedAtRef.current === null) {
      startedAtRef.current = Date.now();
    }
    let cancelled = false;

    const redirectToInvoice = (token: string) => {
      if (redirectedRef.current) return;
      redirectedRef.current = true;
      window.location.href = `${portalBaseUrl}/invoice/${token}`;
    };

    const tick = async () => {
      if (cancelled || redirectedRef.current) return;

      const startedAt = startedAtRef.current ?? Date.now();
      if (Date.now() - startedAt >= TIMEOUT_MS) {
        setTimedOut(true);
        return;
      }

      try {
        const res = await fetch(
          `/api/checkout/session-status?id=${encodeURIComponent(draftSessionId)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          // Treat 4xx/5xx as transient; loop will retry.
          return;
        }
        const data = (await res.json()) as SessionStatusPayload;

        if (data.status === "PAID" && data.completedOrderId) {
          redirectToInvoice(data.shareLinkToken || shareLinkToken);
          return;
        }
        if (
          data.status === "UNLINKED" ||
          data.status === "EXPIRED" ||
          data.status === "CANCELLED"
        ) {
          redirectToInvoice(data.shareLinkToken || shareLinkToken);
          return;
        }
        // ACTIVE, or PAID-without-completedOrderId yet → keep polling.
      } catch {
        // Network blip; loop continues.
      }
    };

    // First tick immediately, then setInterval.
    void tick();
    const handle = setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [draftSessionId, shareLinkToken, portalBaseUrl]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: "clamp(1.5rem, 5vw, 4rem) 1.5rem",
        textAlign: "center",
        color: "var(--text, #1a1a1a)",
        background: "var(--background, #fff)",
      }}
    >
      {timedOut ? (
        <>
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(1.25rem, 1rem + 1vw, 1.625rem)",
              fontWeight: 600,
              margin: 0,
            }}
            data-i18n="processing_state.timeout.title"
          >
            Tar längre tid än vanligt
          </h1>
          <p
            style={{
              fontSize: "0.9375rem",
              maxWidth: 420,
              color: "color-mix(in srgb, var(--text, #000) 70%, transparent)",
              margin: 0,
            }}
            data-i18n="processing_state.timeout.body"
          >
            Din betalning är genomförd, men bekräftelsen har inte
            registrerats ännu. Ladda om sidan om en stund — kontakta
            hotellet om problemet kvarstår.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "12px 20px",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--button-text, #fff)",
              background: "var(--button-bg, #207EA9)",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
            data-i18n="processing_state.timeout.reload"
          >
            Ladda om
          </button>
        </>
      ) : (
        <>
          <Loading size={48} />
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(1.25rem, 1rem + 1vw, 1.625rem)",
              fontWeight: 600,
              margin: 0,
            }}
            data-i18n="processing_state.title"
          >
            Bekräftar din betalning…
          </h1>
          <p
            style={{
              fontSize: "0.9375rem",
              maxWidth: 420,
              color: "color-mix(in srgb, var(--text, #000) 70%, transparent)",
              margin: 0,
            }}
            data-i18n="processing_state.body"
          >
            Det tar bara några sekunder. Stäng inte sidan.
          </p>
        </>
      )}
    </div>
  );
}
