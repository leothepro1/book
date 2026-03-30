"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import type { ResolvedAccommodation } from "@/app/_lib/accommodations/types";

// ── Helpers ──────────────────────────────────────────────────

function statusLabel(status: string): { label: string; className: string } {
  switch (status) {
    case "ACTIVE": return { label: "Aktiv", className: "accommodations-status--active" };
    case "INACTIVE": return { label: "Inaktiv", className: "accommodations-status--inactive" };
    case "ARCHIVED": return { label: "Arkiverad", className: "accommodations-status--archived" };
    default: return { label: status, className: "" };
  }
}

function capacityLabel(min: number, max: number): string {
  if (min === max) return `${max} gäster`;
  return `${min}–${max} gäster`;
}

function formatPrice(amount: number, currency: string): string {
  return formatPriceDisplay(amount, currency) + (currency === "SEK" ? " kr" : "");
}

// ── Types ────────────────────────────────────────────────────

type CategoryTab = { id: string; title: string };

// ── Component ────────────────────────────────────────────────

export default function AccommodationsClient({
  accommodations,
  categories,
  onSync,
}: {
  accommodations: ResolvedAccommodation[];
  categories: CategoryTab[];
  onSync?: () => void;
}) {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<string>("ALL");

  const filtered = accommodations.filter((a) => {
    if (activeCategory === "ALL") return true;
    return a.categoryIds.includes(activeCategory);
  });

  // ── Empty state ──
  if (accommodations.length === 0) {
    return (
      <div className="accommodations-empty">
        <div className="accommodations-empty__icon">
          <EditorIcon name="bed" size={48} />
        </div>
        <h2 className="accommodations-empty__title">Inga boenden ännu</h2>
        <p className="accommodations-empty__desc">
          Anslut ditt PMS för att synka boenden automatiskt.
        </p>
        {onSync && (
          <button
            className="settings-btn--connect"
            style={{ fontSize: 14, padding: "8px 20px" }}
            onClick={onSync}
          >
            Synka PMS
          </button>
        )}
      </div>
    );
  }

  // ── Column header ──
  const columnHeader = (
    <div className="files-column-headers">
      <span className="accommodations-col--thumb" />
      <span className="accommodations-col--name">Boende</span>
      <span className="accommodations-col--detail">Kapacitet</span>
      <span className="accommodations-col--detail accommodations-col--right">Pris/natt</span>
      <span className="accommodations-col--detail">Status</span>
    </div>
  );

  return (
    <>
      {categories.length > 0 && (
        <div className="accommodations-filter-bar">
          <button
            type="button"
            className={`accommodations-filter-btn${activeCategory === "ALL" ? " accommodations-filter-btn--active" : ""}`}
            onClick={() => setActiveCategory("ALL")}
          >
            Alla
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`accommodations-filter-btn${activeCategory === cat.id ? " accommodations-filter-btn--active" : ""}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.title}
            </button>
          ))}
        </div>
      )}
      <div className="accommodations-inner">
        {columnHeader}

        {filtered.map((acc) => {
          const { label: sLabel, className: sClass } = statusLabel(acc.status);
          const imgUrl = acc.media[0]?.url;

          return (
            <div
              key={acc.id}
              className="accommodations-row"
              onClick={() => router.push(`/accommodations/${acc.id}`)}
            >
              <div className="accommodations-col--thumb">
                {imgUrl ? (
                  <img src={imgUrl} alt="" className="accommodations-thumb" />
                ) : (
                  <div className="accommodations-thumb accommodations-thumb--empty">
                    <EditorIcon name="bed" size={18} />
                  </div>
                )}
              </div>
              <div className="accommodations-col--name">
                <span className="accommodations-row__title">{acc.displayName}</span>
                <span className="accommodations-row__slug">{acc.slug}</span>
              </div>
              <div className="accommodations-col--detail">
                {capacityLabel(acc.minGuests, acc.maxGuests)}
              </div>
              <div className="accommodations-col--detail accommodations-col--right">
                {acc.basePricePerNight > 0 ? formatPrice(acc.basePricePerNight, acc.currency) : "–"}
              </div>
              <div className="accommodations-col--detail">
                <span className={`accommodations-status ${sClass}`}>{sLabel}</span>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && accommodations.length > 0 && (
          <div className="accommodations-empty" style={{ padding: "40px 24px" }}>
            <p className="accommodations-empty__desc" style={{ margin: 0 }}>
              Inga boenden matchar filtret.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
