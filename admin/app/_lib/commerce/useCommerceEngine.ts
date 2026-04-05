"use client";

/**
 * useCommerceEngine — Rendering-agnostic Commerce Hook
 * ════════════════════════════════════════════════════
 *
 * Manages accommodation selection, pricing, addons, and checkout
 * initiation. All pricing is computed server-side via fetchPricingAction.
 * No arithmetic happens in this file.
 *
 * Follows the same patterns as useSearchEngine:
 *   - Local useState (no global state)
 *   - Stale-request guard via version counter
 *   - Single automatic retry on PMS_TIMEOUT
 *   - Never throws — all errors in state fields
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { fetchPricingAction } from "./actions/fetchPricing";
import type {
  AccommodationSelection,
  SelectedAddon,
  PricingSummary,
  CommerceStatus,
  CommerceError,
  CommerceEngine,
} from "./types";

// ─── Constants ────────────────────────────────────────────

const RETRY_DELAY = 1000;
const ADDON_DEBOUNCE_MS = 300;

// ─── Validation ────────────────────────────────────────────

function isSelectionComplete(s: AccommodationSelection | null): s is AccommodationSelection {
  return (
    s !== null &&
    s.accommodationId.length > 0 &&
    s.ratePlanId.length > 0 &&
    s.checkIn.length > 0 &&
    s.checkOut.length > 0 &&
    s.adults >= 1
  );
}

// ─── Hook ──────────────────────────────────────────────────

export function useCommerceEngine(options: {
  tenantId: string;
  initialSelection?: AccommodationSelection;
  initialSessionId?: string;
}): CommerceEngine {
  const { tenantId, initialSelection, initialSessionId } = options;

  // ── State ──
  const [selection, setSelection] = useState<AccommodationSelection | null>(
    initialSelection ?? null,
  );
  const [pricing, setPricing] = useState<PricingSummary | null>(null);
  const [pricingStatus, setPricingStatus] = useState<CommerceStatus>("idle");
  const [pricingError, setPricingError] = useState<CommerceError | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<SelectedAddon[]>([]);
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(
    initialSessionId ?? null,
  );
  const [checkoutStatus, setCheckoutStatus] = useState<CommerceStatus>("idle");
  const [checkoutError, setCheckoutError] = useState<CommerceError | null>(null);

  // ── Refs ──
  const pricingVersion = useRef(0);
  const addonDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const addonsRef = useRef(selectedAddons);
  addonsRef.current = selectedAddons;

  // ── fetchPricing ──
  const fetchPricing = useCallback(async () => {
    const currentSelection = selectionRef.current;
    if (!isSelectionComplete(currentSelection)) {
      setPricingError({
        code: "INVALID_PARAMS",
        message: "Ofullständig bokning. Välj boende, datum och gäster.",
      });
      setPricingStatus("error");
      return;
    }

    const version = ++pricingVersion.current;
    setPricingStatus("loading");
    setPricingError(null);

    const result = await fetchPricingAction(
      tenantId,
      currentSelection,
      addonsRef.current,
    );

    // Stale guard — a newer request has been issued
    if (version !== pricingVersion.current) return;

    if (result.error) {
      // Single retry on PMS_TIMEOUT (same pattern as useSearchEngine)
      if (result.error.code === "PMS_TIMEOUT") {
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
        if (version !== pricingVersion.current) return;

        const retry = await fetchPricingAction(
          tenantId,
          currentSelection,
          addonsRef.current,
        );
        if (version !== pricingVersion.current) return;

        if (retry.error) {
          setPricingError(retry.error);
          setPricingStatus("error");
          return;
        }
        setPricing(retry.pricing);
        setPricingStatus("success");
        return;
      }

      setPricingError(result.error);
      setPricingStatus("error");
      return;
    }

    setPricing(result.pricing);
    setPricingStatus("success");
  }, [tenantId]);

  // ── selectAccommodation ──
  const selectAccommodation = useCallback(
    (next: AccommodationSelection) => {
      setSelection(next);
      selectionRef.current = next;

      // Reset checkout state on new selection
      setCheckoutSessionId(null);
      setCheckoutStatus("idle");
      setCheckoutError(null);

      if (isSelectionComplete(next)) {
        // fetchPricing reads from ref, but we just updated it
        void fetchPricing();
      }
    },
    [fetchPricing],
  );

  // ── updateAddons ──
  const updateAddons = useCallback(
    (addons: SelectedAddon[]) => {
      setSelectedAddons(addons);
      addonsRef.current = addons;

      // Debounce re-fetch — prevents rapid calls while user adjusts quantities
      if (addonDebounceTimer.current) {
        clearTimeout(addonDebounceTimer.current);
      }
      addonDebounceTimer.current = setTimeout(() => {
        addonDebounceTimer.current = null;
        if (isSelectionComplete(selectionRef.current)) {
          void fetchPricing();
        }
      }, ADDON_DEBOUNCE_MS);
    },
    [fetchPricing],
  );

  // ── initiateCheckout ──
  // Creates a CheckoutSession via /api/portal/checkout/session.
  // This freezes PMS prices and returns a token + redirect URL.
  // The actual Order + PaymentIntent is created later by the checkout page.
  const initiateCheckout = useCallback(async (): Promise<{
    token: string;
    redirect: string;
    hasAddons: boolean;
  } | null> => {
    // Dedup — if already in flight, bail
    if (checkoutStatus === "loading") return null;

    const currentSelection = selectionRef.current;
    if (!isSelectionComplete(currentSelection)) {
      setCheckoutError({
        code: "INVALID_PARAMS",
        message: "Ofullständig bokning.",
      });
      setCheckoutStatus("error");
      return null;
    }

    setCheckoutStatus("loading");
    setCheckoutError(null);

    try {
      const res = await fetch("/api/portal/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accommodationId: currentSelection.accommodationId,
          ratePlanId: currentSelection.ratePlanId,
          checkIn: currentSelection.checkIn,
          checkOut: currentSelection.checkOut,
          adults: currentSelection.adults + currentSelection.children,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message =
          typeof body.message === "string"
            ? body.message
            : typeof body.error === "string"
              ? body.error
              : "Kassan kunde inte startas. Försök igen.";
        setCheckoutError({ code: "CHECKOUT_FAILED", message });
        setCheckoutStatus("error");
        return null;
      }

      const data: { token: string; redirect: string; hasAddons: boolean } =
        await res.json();
      setCheckoutSessionId(data.token);
      setCheckoutStatus("success");
      return data;
    } catch {
      setCheckoutError({
        code: "CHECKOUT_FAILED",
        message: "Nätverksfel. Kontrollera din anslutning och försök igen.",
      });
      setCheckoutStatus("error");
      return null;
    }
  }, [checkoutStatus]);

  // ── reset ──
  const reset = useCallback(() => {
    pricingVersion.current++;
    if (addonDebounceTimer.current) {
      clearTimeout(addonDebounceTimer.current);
      addonDebounceTimer.current = null;
    }

    setSelection(null);
    selectionRef.current = null;
    setPricing(null);
    setPricingStatus("idle");
    setPricingError(null);
    setSelectedAddons([]);
    addonsRef.current = [];
    // Preserve checkoutSessionId if checkout completed
    if (checkoutStatus !== "success") {
      setCheckoutSessionId(null);
    }
    setCheckoutStatus("idle");
    setCheckoutError(null);
  }, [checkoutStatus]);

  // ── Auto-fetch on mount when initialSelection is complete ──
  useEffect(() => {
    if (isSelectionComplete(selectionRef.current)) {
      void fetchPricing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // empty deps — mount only, intentional

  return {
    selection,
    pricing,
    pricingStatus,
    pricingError,
    selectedAddons,
    checkoutSessionId,
    checkoutStatus,
    checkoutError,
    selectAccommodation,
    updateAddons,
    fetchPricing,
    initiateCheckout,
    reset,
  };
}
