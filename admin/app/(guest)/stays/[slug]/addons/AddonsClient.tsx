"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { resolveContrastPalette } from "@/app/_lib/color/contrast";
import { CheckoutModal } from "@/app/(guest)/checkout/CheckoutModal";
import { SummaryCol } from "@/app/(guest)/_components/SummaryCol";
import type { SummaryRow } from "@/app/(guest)/_components/SummaryCol";
import type { AddonProduct, AddonVariant } from "@/app/_lib/accommodations/addons";
import "@/app/(guest)/_components/spinner-button.css";
import "./addons.css";
import "./spot-booking-modal.css";

// ── Types ─────────────────────────────────────────────────────

type Selection = Map<string, Map<string | "__default", number>>;
// Map<productId, Map<variantId | "__default", quantity>>

export interface SpotAddon {
  id: string;
  type: "spot_map";
  title: string;
  description: string;
  imageUrl: string;
  addonPrice: number;
  hasVariedPricing: boolean;
  currency: string;
  spotMapId: string;
}

export interface SelectedSpot {
  spotMarkerId: string;
  accommodationId: string;
  label: string;
  addonPrice: number;
}

interface Snapshot {
  accommodationId: string;
  accommodationName: string;
  accommodationImage: string | null;
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
  spotAddon: SpotAddon | null;
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
        <span className="material-symbols-rounded" style={{ fontSize: 21, fontWeight: 500 }}>remove</span>
      </button>
      <span className="ao__qty-value">{value}</span>
      <button
        type="button"
        className="ao__qty-btn"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <span className="material-symbols-rounded" style={{ fontSize: 21, fontWeight: 500 }}>add</span>
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
                    <div className="ao__modal-desc" dangerouslySetInnerHTML={{ __html: addon.description }} />
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

export function AddonsClient({ token, addons, spotAddon, snapshot, backUrl }: Props) {
  const router = useRouter();
  const [selections, setSelections] = useState<Selection>(new Map());
  const [modalAddon, setModalAddon] = useState<AddonProduct | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<SelectedSpot | null>(null);
  const [spotModalOpen, setSpotModalOpen] = useState(false);
  const [spotError, setSpotError] = useState<string | null>(null);

  const addonTotal = useMemo(
    () => computeAddonTotal(addons, selections, snapshot),
    [addons, selections, snapshot],
  );
  const spotTotal = selectedSpot ? selectedSpot.addonPrice : 0;
  const grandTotal = snapshot.accommodationTotal + addonTotal + spotTotal;
  const hasSelections = addonTotal > 0 || selectedSpot !== null;

  // Build summary rows for SummaryCol
  const summaryRows = useMemo<SummaryRow[]>(() => {
    const rows: SummaryRow[] = [];
    const checkInDate = parseISO(snapshot.checkIn);
    const checkOutDate = parseISO(snapshot.checkOut);

    rows.push({
      label: "Datum",
      value: `${format(checkInDate, "EEE d", { locale: sv })} – ${format(checkOutDate, "EEE d MMM", { locale: sv })}`,
    });
    rows.push({
      label: "Gäster",
      value: `${snapshot.adults} ${snapshot.adults === 1 ? "vuxen" : "vuxna"}`,
    });

    // Individual addon lines
    for (const addon of addons) {
      const productSel = selections.get(addon.productId);
      if (!productSel) continue;
      if (addon.hasVariants) {
        for (const v of addon.variants) {
          const qty = productSel.get(v.variantId) ?? 0;
          if (qty > 0) {
            const qtyStr = qty > 1 ? ` x${qty}` : "";
            rows.push({
              label: `${addon.title} – ${v.title}${qtyStr}`,
              value: `${formatPriceDisplay(v.price * qty, addon.currency)} kr`,
            });
          }
        }
      } else {
        const qty = productSel.get("__default") ?? 0;
        if (qty > 0) {
          const qtyStr = qty > 1 ? ` x${qty}` : "";
          rows.push({
            label: `${addon.title}${qtyStr}`,
            value: `${formatPriceDisplay(addon.price * qty, addon.currency)} kr`,
          });
        }
      }
    }

    // Spot addon
    if (selectedSpot && spotAddon) {
      rows.push({
        label: `Plats ${selectedSpot.label}`,
        value: `${formatPriceDisplay(selectedSpot.addonPrice, spotAddon.currency)} kr`,
      });
    }

    const taxAmount = Math.round(grandTotal * 0.25);
    rows.push({
      label: "Delsumma",
      value: `${formatPriceDisplay(grandTotal, snapshot.currency)} kr`,
      modifier: "sub",
    });
    rows.push({
      label: "Inkl. moms",
      value: `${formatPriceDisplay(taxAmount, snapshot.currency)} kr`,
      modifier: "sub",
    });
    rows.push({
      label: "Totalt",
      value: `${formatPriceDisplay(grandTotal + taxAmount, snapshot.currency)} kr`,
      modifier: "total",
    });

    return rows;
  }, [snapshot, addons, selections, selectedSpot, spotAddon, grandTotal]);

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
    setSpotError(null);
    const addonPayload: Array<Record<string, unknown>> = [];

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

    // Include spot selection as special entry
    if (selectedSpot) {
      addonPayload.push({
        type: "spot_map",
        spotMarkerId: selectedSpot.spotMarkerId,
        accommodationId: selectedSpot.accommodationId,
        label: selectedSpot.label,
        quantity: 1,
      });
    }

    try {
      const res = await fetch(`/api/portal/checkout/session/${token}/addons`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addons: addonPayload }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.code === "SPOT_UNAVAILABLE") {
          setSpotError(`Plats ${data.label} är inte längre tillgänglig. Välj en annan plats.`);
          setSelectedSpot(null);
        } else {
          setSpotError(data.message || "Kunde inte spara tillägg. Försök igen.");
        }
        setSubmitting(false);
        return;
      }
      router.push(data.redirect);
    } catch {
      setSpotError("Nätverksfel — försök igen.");
      setSubmitting(false);
    }
  }, [selections, selectedSpot, token, router]);

  return (
    <div className="ao">
      {/* ── Left: main content ─────────────────────── */}
      <div className="ao__left">
        <div className="ao__back-col">
          <Link href={backUrl} className="ao__back-btn" aria-label="Tillbaka">
            <span className="material-symbols-rounded" style={{ fontSize: 20 }}>arrow_back</span>
          </Link>
        </div>
        <div className="ao__main-col">
          <h1 className="ao__title">Välj tillägg</h1>

          {addons.length === 0 && (
            <p className="ao__empty">Inga tillägg tillgängliga för detta boende.</p>
          )}

          {spotError && (
            <div className="ao__spot-error">
              <span className="material-symbols-rounded" style={{ fontSize: 18 }}>error</span>
              {spotError}
            </div>
          )}

          <div className="ao__grid">
            {/* Spot booking virtual card — first in list */}
            {spotAddon && (
              <div className={`ao__card${selectedSpot ? " ao__card--selected" : ""}`}>
                <div className="ao__card-img-wrap" onClick={() => setSpotModalOpen(true)} role="button" tabIndex={0} style={{ cursor: "pointer" }}>
                  <img src={spotAddon.imageUrl} alt="" className="ao__card-img" />
                </div>
                <div className="ao__card-body">
                  <h3 className="ao__card-title">{spotAddon.title}</h3>
                  <div className="ao__card-desc" dangerouslySetInnerHTML={{ __html: spotAddon.description }} />
                  <button type="button" className="ao__card-info" onClick={() => setSpotModalOpen(true)}>
                    Mer information
                  </button>
                </div>
                <div className="ao__card-right">
                  <div className="ao__card-price">
                    {selectedSpot ? (
                      <>+{formatPriceDisplay(selectedSpot.addonPrice, spotAddon.currency)} {spotAddon.currency}</>
                    ) : (
                      <>
                        {spotAddon.hasVariedPricing && <span className="ao__card-price-from">Från</span>}
                        {spotAddon.hasVariedPricing ? "" : "+"}{formatPriceDisplay(spotAddon.addonPrice, spotAddon.currency)} {spotAddon.currency}
                      </>
                    )}
                  </div>
                  {selectedSpot ? (
                    <button type="button" className="ao__card-add ao__card-add--edit" onClick={() => setSpotModalOpen(true)}>
                      Ändra
                    </button>
                  ) : (
                    <button type="button" className="ao__card-add" onClick={() => setSpotModalOpen(true)}>
                      Välj plats
                    </button>
                  )}
                </div>
              </div>
            )}

            {addons.map((addon) => {
              const count = getSelectedCount(selections, addon.productId);
              const isSelected = count > 0;
              const isSingleVariant = !addon.hasVariants || addon.variants.filter((v) => v.available).length <= 1;
              const lowestPrice = addon.hasVariants
                ? Math.min(...addon.variants.filter((v) => v.available).map((v) => v.price))
                : addon.price;

              return (
                <div key={addon.productId} className={`ao__card${isSelected ? " ao__card--selected" : ""}${!addon.imageUrl ? " ao__card--no-img" : ""}`}>
                  {addon.imageUrl && (
                    <div className="ao__card-img-wrap" onClick={() => setModalAddon(addon)} role="button" tabIndex={0} style={{ cursor: "pointer" }}>
                      <img src={addon.imageUrl} alt="" className="ao__card-img" />
                    </div>
                  )}
                  <div className="ao__card-body">
                    <h3 className="ao__card-title">{addon.title}</h3>
                    {addon.description && (
                      <div className="ao__card-desc" dangerouslySetInnerHTML={{ __html: addon.description }} />
                    )}
                    <button type="button" className="ao__card-info" onClick={() => setModalAddon(addon)}>
                      Mer information
                    </button>
                  </div>
                  <div className="ao__card-right">
                    <div className="ao__card-price">
                      {!isSingleVariant && <span className="ao__card-price-from">Från</span>}
                      {formatPriceDisplay(lowestPrice, addon.currency)} kr
                      {isSingleVariant && <span className="ao__card-price-unit"> / st</span>}
                    </div>
                    {isSingleVariant ? (
                      /* Simple product — inline quantity control */
                      count > 0 ? (
                        <QtyControl
                          value={count}
                          min={0}
                          max={10}
                          onChange={(n) => setSingleQty(addon, n)}
                        />
                      ) : (
                        <button type="button" className="ao__card-add" onClick={() => setSingleQty(addon, 1)}>
                          Lägg till
                        </button>
                      )
                    ) : (
                      /* Multi-variant product — open modal */
                      isSelected ? (
                        <button type="button" className="ao__card-add ao__card-add--edit" onClick={() => setModalAddon(addon)}>
                          Ändra
                        </button>
                      ) : (
                        <button type="button" className="ao__card-add" onClick={() => setModalAddon(addon)}>
                          Lägg till
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Right: Summary column ──────────────────── */}
      <div className="ao__right">
        <SummaryCol
          title={snapshot.accommodationName}
          image={snapshot.accommodationImage}
          rows={summaryRows}
        />
      </div>

      {/* ── Fixed bottom bar ──────────────────────────── */}
      <div className="ao__bar">
        <div className="ao__bar-inner">
          <div />
          <button
            type="button"
            className="ao__bar-continue sb"
            onClick={handleContinue}
            disabled={submitting}
          >
            <span className={`sb__label${submitting ? " sb__label--hidden" : ""}`}>Fortsätt</span>
            <span className={`sb__spinner${submitting ? " sb__spinner--visible" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Summary modal (CheckoutModal) ──────────── */}
      <CheckoutModal
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        title="Bokningssammanfattning"
      >
        <div className="ao__summary-modal">
          <h4 className="ao__summary-modal-name">{snapshot.accommodationName}</h4>
          <div className="ao__summary-modal-meta">
            {snapshot.checkIn} – {snapshot.checkOut} · {snapshot.totalNights} natter · {snapshot.adults} {snapshot.adults === 1 ? "gast" : "gaster"}
          </div>
          <div className="ao__summary-modal-rate">{snapshot.ratePlanName}</div>

          <div className="ao__summary-modal-divider" />

          <div className="ao__summary-modal-row">
            <span>Boende</span>
            <span>{formatPriceDisplay(snapshot.accommodationTotal, snapshot.currency)} {snapshot.currency}</span>
          </div>

          {addonTotal > 0 && (
            <div className="ao__summary-modal-row">
              <span>Tillagg</span>
              <span>{formatPriceDisplay(addonTotal, snapshot.currency)} {snapshot.currency}</span>
            </div>
          )}

          {selectedSpot && spotAddon && (
            <div className="ao__summary-modal-row">
              <span>Plats {selectedSpot.label}</span>
              <span>+{formatPriceDisplay(selectedSpot.addonPrice, spotAddon.currency)} {spotAddon.currency}</span>
            </div>
          )}

          <div className="ao__summary-modal-divider" />

          <div className="ao__summary-modal-row ao__summary-modal-row--total">
            <span>Totalt</span>
            <span>{formatPriceDisplay(grandTotal, snapshot.currency)} {snapshot.currency}</span>
          </div>
        </div>
      </CheckoutModal>

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

      {/* ── Spot selection modal ──────────────────── */}
      {spotModalOpen && spotAddon && (
        <SpotSelectionModal
          spotAddon={spotAddon}
          snapshot={snapshot}
          currentSpot={selectedSpot}
          onSelect={(spot) => {
            setSelectedSpot(spot);
            setSpotModalOpen(false);
            setSpotError(null);
          }}
          onDeselect={() => {
            setSelectedSpot(null);
            setSpotModalOpen(false);
          }}
          onClose={() => setSpotModalOpen(false)}
        />
      )}
    </div>
  );
}

// ── Spot Selection Modal ─────────────────────────────────────

type SpotMarkerData = {
  id: string;
  label: string;
  x: number;
  y: number;
  accommodationId: string;
  accommodationName: string;
  effectivePrice: number;
  color: string | null;
  available: boolean;
};

function SpotSelectionModal({
  spotAddon,
  snapshot,
  currentSpot,
  onSelect,
  onDeselect,
  onClose,
}: {
  spotAddon: SpotAddon;
  snapshot: Snapshot;
  currentSpot: SelectedSpot | null;
  onSelect: (spot: SelectedSpot) => void;
  onDeselect: () => void;
  onClose: () => void;
}) {
  const [markers, setMarkers] = useState<SpotMarkerData[]>([]);
  const [mapTitle, setMapTitle] = useState("Välj din plats");
  const [mapSubtitle, setMapSubtitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    currentSpot?.spotMarkerId ?? null,
  );

  // Scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Pan/zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const mapRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Touch state for pinch-to-zoom
  const lastTouchDist = useRef<number | null>(null);
  const lastTouchCenter = useRef<{ x: number; y: number } | null>(null);

  // Fetch map data
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      accommodationId: snapshot.accommodationId,
      checkIn: snapshot.checkIn,
      checkOut: snapshot.checkOut,
      adults: String(snapshot.adults),
    });

    fetch(`/api/portal/spot-booking/map?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.spotMap?.markers) {
          const fetched = data.spotMap.markers as SpotMarkerData[];
          setMarkers(fetched);
          if (data.spotMap.title) setMapTitle(data.spotMap.title);
          if (data.spotMap.subtitle) setMapSubtitle(data.spotMap.subtitle);

          if (fetched.length === 0) {
            setError("Inga platser har konfigurerats för denna karta");
          } else {
            // Edge case: previously selected marker no longer exists or
            // is unavailable — clear selection so we don't show a stale tooltip
            if (currentSpot) {
              const still = fetched.find((m: SpotMarkerData) => m.id === currentSpot.spotMarkerId);
              if (!still) {
                setSelectedId(null);
                onDeselect();
              }
            }
          }
        } else {
          setError("Kunde inte ladda kartan");
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Natverksfel — forsok igen");
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [snapshot.accommodationId, snapshot.checkIn, snapshot.checkOut, snapshot.adults]);

  // Clamp pan so the map can't be dragged outside viewport.
  // Transform is: scale(z) translate(px, py) with transform-origin: 0 0
  // So the image spans from (px*z, py*z) to (px*z + imgW*z, py*z + imgH*z)
  // We want: left edge <= 0 and right edge >= mapW
  //   px*z <= 0  →  px <= 0
  //   px*z + imgW*z >= mapW  →  px >= (mapW - imgW*z) / z  →  px >= mapW/z - imgW
  const clampPan = useCallback((p: { x: number; y: number }, z: number) => {
    if (z <= 1) return { x: 0, y: 0 };
    const img = imageRef.current;
    const map = mapRef.current;
    if (!img || !map) return p;
    const imgW = img.clientWidth;
    const imgH = img.clientHeight;
    const mapW = map.clientWidth;
    const mapH = map.clientHeight;
    const minPanX = mapW / z - imgW;
    const minPanY = mapH / z - imgH;
    return {
      x: Math.max(minPanX, Math.min(0, p.x)),
      y: Math.max(minPanY, Math.min(0, p.y)),
    };
  }, []);

  // Snap-to-marker: smoothly animate pan so tooltip is fully visible
  const snapAnimRef = useRef<number | null>(null);

  const snapToMarker = useCallback((m: SpotMarkerData) => {
    const img = imageRef.current;
    const map = mapRef.current;
    if (!img || !map) return;

    const imgW = img.clientWidth;
    const imgH = img.clientHeight;
    const mapW = map.clientWidth;
    const mapH = map.clientHeight;

    // Current pixel position of marker in map viewport
    const markerPxX = (m.x / 100) * imgW * zoom + pan.x * zoom;
    const markerPxY = (m.y / 100) * imgH * zoom + pan.y * zoom;

    // Tooltip dimensions (approximate)
    const tooltipW = 190;
    const tooltipH = 140;
    const tooltipAbove = m.y >= 15;
    const padding = 24;

    // Combo bounds: marker + tooltip
    const comboTop = tooltipAbove ? markerPxY - tooltipH - 20 : markerPxY - 20;
    const comboBottom = tooltipAbove ? markerPxY + 20 : markerPxY + tooltipH + 20;
    const comboLeft = markerPxX - tooltipW / 2;
    const comboRight = markerPxX + tooltipW / 2;

    // Check if already comfortably visible
    const isVisible = comboLeft > padding && comboRight < mapW - padding
      && comboTop > padding && comboBottom < mapH - padding;
    if (isVisible) return;

    // Blend: 60% toward center, 40% just-enough-to-fit
    const centerDx = mapW / 2 - markerPxX;
    const centerDy = mapH / 2 - (comboTop + comboBottom) / 2;

    let fitDx = 0;
    let fitDy = 0;
    if (comboLeft < padding) fitDx = padding - comboLeft;
    else if (comboRight > mapW - padding) fitDx = mapW - padding - comboRight;
    if (comboTop < padding) fitDy = padding - comboTop;
    else if (comboBottom > mapH - padding) fitDy = mapH - padding - comboBottom;

    const blend = 0.6;
    const dx = fitDx + (centerDx - fitDx) * blend;
    const dy = fitDy + (centerDy - fitDy) * blend;

    const targetPan = clampPan(
      { x: pan.x + dx / zoom, y: pan.y + dy / zoom },
      zoom,
    );

    // Animate with JS — ease-out cubic over 350ms
    if (snapAnimRef.current) cancelAnimationFrame(snapAnimRef.current);
    const startPan = { ...pan };
    const startTime = performance.now();
    const duration = 350;

    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // cubic ease-out

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const e = ease(progress);
      setPan({
        x: startPan.x + (targetPan.x - startPan.x) * e,
        y: startPan.y + (targetPan.y - startPan.y) * e,
      });
      if (progress < 1) {
        snapAnimRef.current = requestAnimationFrame(animate);
      } else {
        snapAnimRef.current = null;
      }
    };

    snapAnimRef.current = requestAnimationFrame(animate);
  }, [zoom, pan, clampPan]);

  // Mouse pan — only when zoomed in
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || zoom <= 1) return;
      if (snapAnimRef.current) { cancelAnimationFrame(snapAnimRef.current); snapAnimRef.current = null; }
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    },
    [pan, zoom],
  );

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: globalThis.MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      const raw = { x: dragStart.current.panX + dx / zoom, y: dragStart.current.panY + dy / zoom };
      setPan(clampPan(raw, zoom));
    };
    const handleUp = () => setIsDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => { window.removeEventListener("mousemove", handleMove); window.removeEventListener("mouseup", handleUp); };
  }, [isDragging, zoom, clampPan]);

  // Reset pan when zoom returns to 1
  useEffect(() => {
    if (zoom <= 1) setPan({ x: 0, y: 0 });
  }, [zoom]);

  // Scroll zoom
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((z) => {
        const next = Math.min(4, Math.max(1, z * delta));
        if (next <= 1) setPan({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [loading]);

  // Touch handlers for pan + pinch-to-zoom
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1 && zoom > 1) {
        const t = e.touches[0];
        dragStart.current = { x: t.clientX, y: t.clientY, panX: pan.x, panY: pan.y };
        setIsDragging(true);
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist.current = Math.hypot(dx, dy);
        lastTouchCenter.current = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && isDragging) {
        const t = e.touches[0];
        const dx = t.clientX - dragStart.current.x;
        const dy = t.clientY - dragStart.current.y;
        const raw = { x: dragStart.current.panX + dx / zoom, y: dragStart.current.panY + dy / zoom };
        setPan(clampPan(raw, zoom));
      } else if (e.touches.length === 2 && lastTouchDist.current !== null) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const scale = dist / lastTouchDist.current;
        setZoom((z) => Math.min(4, Math.max(1, z * scale)));
        lastTouchDist.current = dist;
      }
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      lastTouchDist.current = null;
      lastTouchCenter.current = null;
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDragging, zoom, pan]);

  const availableCount = markers.filter((m) => m.available).length;
  const activeMarker = markers.find((m) => m.id === selectedId);

  return (
    <div className="ao__modal-overlay" onClick={onClose}>
      <div className="ao__modal-wrap">
        <button className="ao__modal-close" onClick={onClose} aria-label="Stäng">
          <span className="material-symbols-rounded" style={{ fontSize: 24 }}>close</span>
        </button>
        <div className="ao__modal sbm__modal" onClick={(e) => e.stopPropagation()}>
          <div className="sbm__modal-header">
            <h3 className="ao__modal-title">{mapTitle}</h3>
            {!loading && !error && (
              <p className="sbm__modal-subtitle">
                {mapSubtitle || `${availableCount} av ${markers.length} platser lediga`}
              </p>
            )}
          </div>

          {error && <div className="sbm__error">{error}</div>}

          {loading ? (
            <div className="sbm__loading">
              {/* @ts-expect-error — dotlottie-wc web component */}
              <dotlottie-wc src="/animations/loading.lottie" speed="1.6" style={{ width: 48, height: 48, filter: "brightness(0.3)" }} loop autoplay />
            </div>
          ) : (
            <div
              ref={mapRef}
              className={`sbm__map${zoom > 1 ? (isDragging ? " sbm__map--dragging" : " sbm__map--zoomedIn") : ""}`}
              onMouseDown={handleMouseDown}
            >

              <div
                className="sbm__map-inner"
                style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imageRef}
                  src={spotAddon.imageUrl}
                  alt="Karta"
                  className="sbm__map-image"
                  draggable={false}
                  onLoad={() => setImgLoaded(true)}
                />
              </div>

              {/* Markers rendered outside scale transform — always crisp */}
              {imgLoaded && imageRef.current && markers.map((m) => {
                const isActive = selectedId === m.id;
                let cls = "sbm__marker";
                if (!m.available) cls += " sbm__marker--unavailable";
                if (isActive) cls += " sbm__marker--selected";

                // Convert % position to pixel position relative to sbm__map
                const imgW = imageRef.current!.clientWidth;
                const imgH = imageRef.current!.clientHeight;
                const pxX = (m.x / 100) * imgW * zoom + pan.x * zoom;
                const pxY = (m.y / 100) * imgH * zoom + pan.y * zoom;

                return (
                  <div
                    key={m.id}
                    className={cls}
                    style={{ left: pxX, top: pxY, transform: "translate(-50%, -50%)" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!m.available) return;
                      if (isActive) {
                        setSelectedId(null);
                      } else {
                        setSelectedId(m.id);
                        // Wait one frame for tooltip to be positioned, then snap
                        requestAnimationFrame(() => snapToMarker(m));
                      }
                    }}
                  >
                    {/* Tooltip */}
                    {isActive && (
                      <div className={`sbm__tooltip${m.y < 15 ? " sbm__tooltip--below" : ""}`} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="sbm__tooltip-close"
                          onClick={(e) => { e.stopPropagation(); setSelectedId(null); }}
                        >
                          <span className="material-symbols-rounded" style={{ fontSize: 20, color: "#6c6c6c" }}>close</span>
                        </button>
                        <span className="sbm__tooltip-name">{m.accommodationName}</span>
                        <span className="sbm__tooltip-price">
                          {formatPriceDisplay(m.effectivePrice, spotAddon.currency)} {spotAddon.currency}
                        </span>
                        {currentSpot?.spotMarkerId === m.id ? (
                          <button
                            type="button"
                            className="sbm__tooltip-select sbm__tooltip-select--deselect"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeselect();
                            }}
                          >
                            Avmarkera
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="sbm__tooltip-select"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect({
                                spotMarkerId: m.id,
                                accommodationId: m.accommodationId,
                                label: m.label,
                                addonPrice: m.effectivePrice,
                              });
                            }}
                          >
                            Välj
                          </button>
                        )}
                        <div className="sbm__tooltip-arrow" />
                      </div>
                    )}
                    <div
                      className="sbm__marker-dot"
                      style={m.color ? { background: m.color, color: resolveContrastPalette(m.color).text } : undefined}
                    >{m.label.slice(0, 3)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
