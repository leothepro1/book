"use client";

/**
 * Search Results Renderer
 * ───────────────────────
 * Locked section renderer for the stays/search page.
 * Renders compact search form + availability results.
 * Data fetched client-side from /api/availability.
 */

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { SectionRendererProps } from "@/app/_lib/sections/types";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { formatDateRange } from "@/app/_lib/search/dates";
import "./search-results-renderer.css";

// ── Types ──────────────────────────────────────────────────────

interface RoomCategory {
  externalId: string;
  name: string;
  shortDescription: string;
  type: string;
  imageUrls: string[];
  maxGuests: number;
  facilities: string[];
  basePricePerNight: number;
}

interface RatePlan {
  externalId: string;
  name: string;
  nightlyAmount: number;
  totalAmount: number;
  currency: string;
}

interface AvailabilityEntry {
  category: RoomCategory;
  ratePlans: RatePlan[];
  availableUnits: number;
  available: boolean;
  restrictionViolations: string[];
}

interface AvailabilityResponse {
  results: AvailabilityEntry[];
  searchParams: { checkIn: string; checkOut: string; guests: number; nights: number };
  tenantId: string;
}

// ── Compact Search Form ────────────────────────────────────────

function CompactSearchForm({
  defaultCheckIn,
  defaultCheckOut,
  defaultGuests,
}: {
  defaultCheckIn: string;
  defaultCheckOut: string;
  defaultGuests: number;
}) {
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);
  const [guests, setGuests] = useState(defaultGuests);
  const today = new Date().toISOString().split("T")[0];

  return (
    <form
      className="sr__form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!checkIn || !checkOut || guests < 1) return;
        const params = new URLSearchParams(window.location.search);
        params.set("checkIn", checkIn);
        params.set("checkOut", checkOut);
        params.set("guests", String(guests));
        window.location.search = params.toString();
      }}
    >
      <div className="sr__form-field">
        <label className="sr__form-label">Incheckning</label>
        <input type="date" value={checkIn} min={today} onChange={(e) => { setCheckIn(e.target.value); if (checkOut && e.target.value >= checkOut) setCheckOut(""); }} className="sr__form-input" required />
      </div>
      <div className="sr__form-field">
        <label className="sr__form-label">Utcheckning</label>
        <input type="date" value={checkOut} min={checkIn || today} onChange={(e) => setCheckOut(e.target.value)} className="sr__form-input" required />
      </div>
      <div className="sr__form-field sr__form-field--guests">
        <label className="sr__form-label">Gäster</label>
        <input type="number" value={guests} min={1} max={99} onChange={(e) => setGuests(parseInt(e.target.value, 10) || 1)} className="sr__form-input" required />
      </div>
      <button type="submit" className="sr__form-btn">
        <span className="material-symbols-rounded" style={{ fontSize: 20 }}>search</span>
        Sök
      </button>
    </form>
  );
}

// ── Room Card ──────────────────────────────────────────────────

function RoomCard({ entry, searchParams }: { entry: AvailabilityEntry; searchParams: string }) {
  const { category, ratePlans, available, restrictionViolations } = entry;
  const lowestNightly = ratePlans.length > 0 ? Math.min(...ratePlans.map((rp) => rp.nightlyAmount)) : 0;
  const image = category.imageUrls[0];

  return (
    <div className="sr__card">
      <div className="sr__card-image">
        {image ? <img src={image} alt={category.name} /> : <div className="sr__card-placeholder" />}
      </div>
      <div className="sr__card-info">
        <div className="sr__card-type">{category.type}</div>
        <h3 className="sr__card-title">{category.name}</h3>
        <p className="sr__card-desc">{category.shortDescription}</p>
        <div className="sr__card-meta">
          <span className="material-symbols-rounded" style={{ fontSize: 16 }}>person</span>
          Upp till {category.maxGuests} gäster
        </div>
      </div>
      <div className="sr__card-action">
        {available ? (
          <>
            <div className="sr__card-price">
              Från {formatPriceDisplay(lowestNightly)} kr
              <span className="sr__card-price-unit">/natt</span>
            </div>
            <Link href={`/stays/${category.externalId}?${searchParams}`} className="sr__card-btn">Välj</Link>
          </>
        ) : (
          <div className="sr__card-unavailable">{restrictionViolations[0] ?? "Ej tillgängligt"}</div>
        )}
      </div>
    </div>
  );
}

// ── Main Renderer ──────────────────────────────────────────────

export function SearchResultsDefaultRenderer(props: SectionRendererProps) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkIn = searchParams.get("checkIn") ?? "";
  const checkOut = searchParams.get("checkOut") ?? "";
  const guests = parseInt(searchParams.get("guests") ?? "2", 10);
  const tenantId = props.config?.tenantId ?? "";
  const hasSearch = !!(checkIn && checkOut && guests > 0 && tenantId);

  useEffect(() => {
    if (!hasSearch) { setLoaded(true); return; }
    const params = new URLSearchParams();
    params.set("tenantId", tenantId);
    params.set("checkIn", checkIn);
    params.set("checkOut", checkOut);
    params.set("guests", String(guests));

    fetch(`/api/availability?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Fetch failed");
        setData(await res.json());
        setLoaded(true);
      })
      .catch(() => { setError("Kunde inte hämta tillgänglighet."); setLoaded(true); });
  }, [checkIn, checkOut, guests, tenantId, hasSearch]);

  const searchParamsStr = hasSearch ? `checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}` : "";

  return (
    <section className="sr">
      {!hasSearch ? (
        <div className="sr__empty">
          <span className="material-symbols-rounded" style={{ fontSize: 48, opacity: 0.15 }}>travel_explore</span>
          <h2 className="sr__empty-title">Sök lediga boenden</h2>
          <p className="sr__empty-text">Välj datum och antal gäster för att se tillgänglighet.</p>
        </div>
      ) : !loaded ? (
        <div className="sr__grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="sr__card sr__card--skeleton">
              <div className="sr__card-image sr__skeleton-pulse" />
              <div className="sr__card-info"><div className="sr__skeleton-line" /><div className="sr__skeleton-line sr__skeleton-line--lg" /></div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="sr__empty">
          <p className="sr__empty-text" style={{ color: "var(--error, #dc2626)" }}>{error}</p>
        </div>
      ) : data && data.results.length > 0 ? (
        <>
          <div className="sr__results-header">
            {data.results.length} boende{data.results.length !== 1 ? "n" : ""} ·{" "}
            {formatDateRange(new Date(data.searchParams.checkIn), new Date(data.searchParams.checkOut))} ·{" "}
            {data.searchParams.nights} nätter · {data.searchParams.guests} gäster
          </div>
          <div className="sr__grid">
            {data.results.map((entry) => (
              <RoomCard key={entry.category.externalId} entry={entry} searchParams={searchParamsStr} />
            ))}
          </div>
        </>
      ) : (
        <div className="sr__empty">
          <span className="material-symbols-rounded" style={{ fontSize: 48, opacity: 0.15 }}>hotel</span>
          <h2 className="sr__empty-title">Inga lediga boenden</h2>
          <p className="sr__empty-text">Prova andra datum eller färre gäster.</p>
        </div>
      )}
    </section>
  );
}
