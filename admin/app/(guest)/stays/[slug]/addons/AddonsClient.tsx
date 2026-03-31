"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import type { AddonProduct, AddonVariant } from "@/app/_lib/accommodations/addons";
import "./addons.css";

// ── Types ─────────────────────────────────────────────────────

type Selection = Map<string, Map<string | "__default", number>>;
// Map<productId, Map<variantId | "__default", quantity>>

interface Snapshot {
  accommodationName: string;
  accommodationSlug: string;
  ratePlanName: string;
  ratePlanCancellationPolicy: string;
  pricePerNight: number;
  totalNights: number;
  accommodationTotal: number;
  currency: string;
  checkIn: string;
  checkOut: string;
  adults: number;
}

interface Props {
  token: string;
  addons: AddonProduct[];
  snapshot: Snapshot;
  backUrl: string;
}

// ── Helpers ───────────────────────────────────────────────────

const PRICING_MODE = "PER_STAY"; // Default — products don't have pricingMode

function computeAddonTotal(
  addons: AddonProduct[],
  selections: Selection,
  _snapshot: Snapshot,
): number {
  let total = 0;
  for (const addon of addons) {
    const productSel = selections.get(addon.productId);
    if (!productSel) continue;

    if (addon.hasVariants) {
      for (const variant of addon.variants) {
        const qty = productSel.get(variant.variantId) ?? 0;
        if (qty > 0) total += variant.price * qty;
      }
    } else {
      const qty = productSel.get("__default") ?? 0;
      if (qty > 0) total += addon.price * qty;
    }
  }
  return total;
}

function getSelectedCount(selections: Selection, productId: string): number {
  const productSel = selections.get(productId);
  if (!productSel) return 0;
  let count = 0;
  for (const qty of productSel.values()) count += qty;
  return count;
}

// ── Quantity control ──────────────────────────────────────────

function QtyControl({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="ao__qty">
      <button
        type="button"
        className="ao__qty-btn"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <span className="material-symbols-rounded" style={{ fontSize: 18 }}>remove</span>
      </button>
      <span className="ao__qty-value">{value}</span>
      <button
        type="button"
        className="ao__qty-btn"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <span className="material-symbols-rounded" style={{ fontSize: 18 }}>add</span>
      </button>
    </div>
  );
}

// ── Variant modal ─────────────────────────────────────────────

function VariantModal({
  addon,
  snapshot,
  initial,
  onConfirm,
  onClose,
}: {
  addon: AddonProduct;
  snapshot: Snapshot;
  initial: Map<string, number>;
  onConfirm: (selections: Map<string, number>) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<Map<string, number>>(() => new Map(initial));

  const hasVariants = addon.hasVariants && addon.variants.filter((v) => v.available).length > 0;

  const setQty = (key: string, qty: number) => {
    setLocal((prev) => {
      const next = new Map(prev);
      if (qty <= 0) next.delete(key);
      else next.set(key, qty);
      return next;
    });
  };

  const grandTotal = useMemo(() => {
    let total = 0;
    if (hasVariants) {
      for (const v of addon.variants) {
        const qty = local.get(v.variantId) ?? 0;
        if (qty > 0) total += v.price * qty;
      }
    } else {
      const qty = local.get("__default") ?? 0;
      if (qty > 0) total += addon.price * qty;
    }
    return total;
  }, [addon, hasVariants, local]);

  const hasSelection = grandTotal > 0;

  return (
    <div className="ao__modal-overlay" onClick={onClose}>
      <div className="ao__modal-wrap">
        <button className="ao__modal-close" onClick={onClose} aria-label="Stäng">
          <span className="material-symbols-rounded" style={{ fontSize: 24 }}>close</span>
        </button>
        <div className="ao__modal" onClick={(e) => e.stopPropagation()}>
          <div className="ao__modal-layout">
            {addon.imageUrl && (
              <div className="ao__modal-img-col">
                <img src={addon.imageUrl} alt="" className="ao__modal-img" />
              </div>
            )}
            <div className="ao__modal-content-col">
              <div className="ao__modal-scroll">
                <div className="ao__modal-header">
                  <h3 className="ao__modal-title">{addon.title}</h3>
                  {addon.description && (
                    <p className="ao__modal-desc">{addon.description}</p>
                  )}
                </div>

        <div className="ao__modal-body">
          {hasVariants ? (
            addon.variants.filter((v) => v.available).map((v) => {
              const qty = local.get(v.variantId) ?? 0;
              const lineTotal = v.price * qty;
              return (
                <div key={v.variantId} className="ao__modal-variant">
                  <div className="ao__modal-variant-info">
                    <span className="ao__modal-variant-title">{v.title}</span>
                    <span className="ao__modal-variant-price">
                      {formatPriceDisplay(v.price, addon.currency)} {addon.currency}
                    </span>
                  </div>
                  <div className="ao__modal-variant-right">
                    <QtyControl
                      value={qty}
                      min={0}
                      max={10}
                      onChange={(n) => setQty(v.variantId, n)}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="ao__modal-variant">
              <div className="ao__modal-variant-info">
                <span className="ao__modal-variant-price">
                  {formatPriceDisplay(addon.price, addon.currency)} {addon.currency}
                </span>
              </div>
              <div className="ao__modal-variant-right">
                <QtyControl
                  value={local.get("__default") ?? 0}
                  min={0}
                  max={10}
                  onChange={(n) => setQty("__default", n)}
                />
              </div>
            </div>
          )}
        </div>

              </div>
        <div className="ao__modal-footer">
          <button
            type="button"
            className="ao__modal-confirm"
            onClick={() => onConfirm(local)}
          >
            {hasSelection
              ? `Lägg till · ${formatPriceDisplay(grandTotal, addon.currency)} ${addon.currency}`
              : "Klar"}
          </button>
        </div>
            </div>
          </div>
      </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export function AddonsClient({ token, addons, snapshot, backUrl }: Props) {
  const router = useRouter();
  const [selections, setSelections] = useState<Selection>(new Map());
  const [modalAddon, setModalAddon] = useState<AddonProduct | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const addonTotal = useMemo(
    () => computeAddonTotal(addons, selections, snapshot),
    [addons, selections, snapshot],
  );
  const grandTotal = snapshot.accommodationTotal + addonTotal;
  const hasSelections = addonTotal > 0;

  // Single-variant inline toggle
  const toggleSingleVariant = useCallback((addon: AddonProduct) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const existing = next.get(addon.productId);
      const key = addon.hasVariants ? addon.variants[0].variantId : "__default";
      const currentQty = existing?.get(key) ?? 0;

      if (currentQty > 0) {
        next.delete(addon.productId);
      } else {
        next.set(addon.productId, new Map([[key, 1]]));
      }
      return next;
    });
  }, []);

  // Single-variant quantity change
  const setSingleQty = useCallback((addon: AddonProduct, qty: number) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const key = addon.hasVariants ? addon.variants[0].variantId : "__default";
      if (qty <= 0) {
        next.delete(addon.productId);
      } else {
        next.set(addon.productId, new Map([[key, qty]]));
      }
      return next;
    });
  }, []);

  // Multi-variant modal confirm
  const handleVariantConfirm = useCallback((addon: AddonProduct, variantSelections: Map<string, number>) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const filtered = new Map<string, number>();
      for (const [vid, qty] of variantSelections) {
        if (qty > 0) filtered.set(vid, qty);
      }
      if (filtered.size === 0) {
        next.delete(addon.productId);
      } else {
        next.set(addon.productId, filtered as Map<string | "__default", number>);
      }
      return next;
    });
    setModalAddon(null);
  }, []);

  // Submit
  const handleContinue = useCallback(async () => {
    setSubmitting(true);
    const addonPayload: Array<{ productId: string; variantId: string | null; quantity: number }> = [];

    for (const [productId, variantMap] of selections) {
      for (const [key, qty] of variantMap) {
        if (qty <= 0) continue;
        addonPayload.push({
          productId,
          variantId: key === "__default" ? null : key,
          quantity: qty,
        });
      }
    }

    try {
      const res = await fetch(`/api/portal/checkout/session/${token}/addons`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addons: addonPayload }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitting(false);
        return;
      }
      router.push(data.redirect);
    } catch {
      setSubmitting(false);
    }
  }, [selections, token, router]);

  return (
    <div className="ao">
      {/* ── Step indicator ──────────────────────────── */}
      <div className="ao__steps">
        <Link href={backUrl} className="ao__step ao__step--done">
          <span className="ao__step-num">1</span>
          <span className="ao__step-label">Välj boende</span>
        </Link>
        <span className="ao__step-divider" />
        <span className="ao__step ao__step--active">
          <span className="ao__step-num">2</span>
          <span className="ao__step-label">Välj tillägg</span>
        </span>
        <span className="ao__step-divider" />
        <span className="ao__step ao__step--future">
          <span className="ao__step-num">3</span>
          <span className="ao__step-label">Utcheckning</span>
        </span>
      </div>

      <div className="ao__layout">
        {/* ── Main: addon grid ──────────────────────── */}
        <div className="ao__main">
          <h1 className="ao__title">Välj tillägg</h1>

          {addons.length === 0 && (
            <p className="ao__empty">Inga tillägg tillgängliga för detta boende.</p>
          )}

          <div className="ao__grid">
            {addons.map((addon) => {
              const count = getSelectedCount(selections, addon.productId);
              const isSelected = count > 0;
              const isSingleVariant = !addon.hasVariants || addon.variants.filter((v) => v.available).length <= 1;
              const lowestPrice = addon.hasVariants
                ? Math.min(...addon.variants.filter((v) => v.available).map((v) => v.price))
                : addon.price;

              return (
                <div key={addon.productId} className={`ao__card${isSelected ? " ao__card--selected" : ""}`}>
                  {addon.imageUrl && (
                    <div className="ao__card-img-wrap" onClick={() => setModalAddon(addon)} role="button" tabIndex={0} style={{ cursor: "pointer" }}>
                      <img src={addon.imageUrl} alt="" className="ao__card-img" />
                    </div>
                  )}
                  <div className="ao__card-body">
                    <h3 className="ao__card-title">{addon.title}</h3>
                    {addon.description && (
                      <p className="ao__card-desc">{addon.description}</p>
                    )}
                    <div className="ao__card-price">
                      {addon.hasVariants && addon.variants.length > 1 ? "Från " : ""}
                      {formatPriceDisplay(lowestPrice, addon.currency)} {addon.currency}
                    </div>

                    {/* Selected state */}
                    {isSelected && (
                      <div className="ao__card-selected-row">
                        <span className="ao__card-selected-count">{count} {count === 1 ? "vald" : "valda"}</span>
                        <button
                          type="button"
                          className="ao__card-edit"
                          onClick={() => setModalAddon(addon)}
                        >
                          Ändra
                        </button>
                        <button
                          type="button"
                          className="ao__card-remove"
                          onClick={() => {
                            setSelections((prev) => {
                              const next = new Map(prev);
                              next.delete(addon.productId);
                              return next;
                            });
                          }}
                        >
                          Ta bort
                        </button>
                      </div>
                    )}

                    {/* CTA when not selected */}
                    {!isSelected && (
                      <button
                        type="button"
                        className="ao__card-add"
                        onClick={() => setModalAddon(addon)}
                      >
                        Lägg till
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ── Fixed bottom bar ──────────────────────────── */}
      <div className="ao__bar">
        <button
          type="button"
          className="ao__bar-summary-btn"
          onClick={() => setSummaryOpen(true)}
        >
          Bokningssammanfattning
        </button>
        <button
          type="button"
          className="ao__bar-continue"
          onClick={handleContinue}
          disabled={submitting}
        >
          {submitting
            ? "Sparar..."
            : hasSelections
              ? "Fortsätt till utcheckning"
              : "Fortsätt utan tillägg"}
        </button>
      </div>

      {/* ── Summary modal ──────────────────────────── */}
      {summaryOpen && (
        <div className="ao__modal-overlay" onClick={() => setSummaryOpen(false)}>
          <div className="ao__modal" onClick={(e) => e.stopPropagation()}>
            <div className="ao__modal-header">
              <div className="ao__modal-header-left">
                <h3 className="ao__modal-title">Bokningssammanfattning</h3>
              </div>
              <button className="ao__modal-close" onClick={() => setSummaryOpen(false)} aria-label="Stäng">
                <span className="material-symbols-rounded" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
            <div className="ao__modal-body">
              <div className="ao__summary-modal">
                <h4 className="ao__summary-modal-name">{snapshot.accommodationName}</h4>
                <div className="ao__summary-modal-meta">
                  {snapshot.checkIn} – {snapshot.checkOut} · {snapshot.totalNights} nätter · {snapshot.adults} {snapshot.adults === 1 ? "gäst" : "gäster"}
                </div>
                <div className="ao__summary-modal-rate">{snapshot.ratePlanName}</div>

                <div className="ao__summary-modal-divider" />

                <div className="ao__summary-modal-row">
                  <span>Boende</span>
                  <span>{formatPriceDisplay(snapshot.accommodationTotal, snapshot.currency)} {snapshot.currency}</span>
                </div>

                {hasSelections && (
                  <div className="ao__summary-modal-row">
                    <span>Tillägg</span>
                    <span>{formatPriceDisplay(addonTotal, snapshot.currency)} {snapshot.currency}</span>
                  </div>
                )}

                <div className="ao__summary-modal-divider" />

                <div className="ao__summary-modal-row ao__summary-modal-row--total">
                  <span>Totalt</span>
                  <span>{formatPriceDisplay(grandTotal, snapshot.currency)} {snapshot.currency}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Variant modal ──────────────────────────── */}
      {modalAddon && (
        <VariantModal
          addon={modalAddon}
          snapshot={snapshot}
          initial={selections.get(modalAddon.productId) as Map<string, number> ?? new Map()}
          onConfirm={(sel) => handleVariantConfirm(modalAddon, sel)}
          onClose={() => setModalAddon(null)}
        />
      )}
    </div>
  );
}
