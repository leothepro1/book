"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * VisitorsLiveCard — "Besökare just nu".
 *
 * Mirror of Shopify Live View's primary metric: a single big number
 * representing the count of distinct active session_ids over the last
 * 5 minutes for the current tenant.
 *
 * Polling cadence: every 5 minutes. Per recon §5.7 RESOLVED, native
 * setInterval + useRef cleanup + AbortController for in-flight fetch
 * cancellation on unmount. No SWR / React Query (verified absent
 * from package.json — `npm run typecheck` would fail anyway).
 *
 * States:
 *   - Initial / refetching: skeleton (analytics-summary-card__skeleton)
 *   - Loaded:    big number + "Besökare just nu" + "uppdaterad för X sek sedan"
 *   - Error:     "Kunde inte ladda besökare" + retry button
 *
 * Empty state is "0" rendered literally per recon §5.4 RESOLVED — no
 * "ingen data ännu" disambiguation in v1. The widget docstring (B.7
 * runbook) explains what "0" means.
 *
 * Multi-tab semantics per recon §2.5: 1 human with 3 tabs counts as 3
 * besökare. Industry-standard; documented in B.7 runbook.
 */

interface VisitorsResponse {
  visitorsNow: number;
  updatedAt: string;
  source: "cache" | "fresh";
}

const POLL_INTERVAL_MS = 5 * 60 * 1000;

function formatSecondsAgo(updatedAt: string, now: number): string {
  const updatedMs = Date.parse(updatedAt);
  if (Number.isNaN(updatedMs)) return "";
  const seconds = Math.max(0, Math.floor((now - updatedMs) / 1000));
  if (seconds < 60) return `uppdaterad för ${seconds} sek sedan`;
  const minutes = Math.floor(seconds / 60);
  return `uppdaterad för ${minutes} min sedan`;
}

export function VisitorsLiveCard() {
  const [data, setData] = useState<VisitorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Tick once a second so the "X sek sedan" subtitle stays accurate
  // between polls. Cheap (re-render only re-formats a string).
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    // Cancel any in-flight fetch before starting a new one. Important
    // for unmount + retry — without this, a stale response could
    // resolve after we've moved on.
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics/live/visitors", {
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const body = (await res.json()) as VisitorsResponse;
      // Don't apply state if a newer request started after this one
      // (the controller would have been replaced).
      if (abortRef.current === controller) {
        setData(body);
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setError("Kunde inte ladda besökare");
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchData();
    intervalRef.current = setInterval(() => {
      void fetchData();
    }, POLL_INTERVAL_MS);
    tickRef.current = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchData]);

  return (
    <div
      className="analytics-summary-card"
      aria-live="polite"
      aria-label="Besökare just nu"
    >
      <div className="analytics-summary-card__label">Besökare just nu</div>
      {loading && data === null ? (
        <div className="analytics-summary-card__skeleton" />
      ) : error ? (
        <div className="analytics-summary-card__value">
          {error}{" "}
          <button
            type="button"
            onClick={() => void fetchData()}
            className="analytics-summary-card__retry"
          >
            Försök igen
          </button>
        </div>
      ) : (
        <>
          <div className="analytics-summary-card__value">
            {data ? data.visitorsNow : 0}
          </div>
          {data && (
            <div className="analytics-summary-card__hint">
              {formatSecondsAgo(data.updatedAt, nowMs)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
