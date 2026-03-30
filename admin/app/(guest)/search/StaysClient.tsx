"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import { formatDateRange } from "@/app/_lib/search/dates";
import { track } from "@/app/_lib/analytics/client";
import "./stays.css";

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
  cancellationPolicy: string;
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

interface StaysClientProps {
  tenantId: string;
  initialData: AvailabilityResponse | null;
  initialError?: string | null;
  initialParams: {
    checkIn: string | null;
    checkOut: string | null;
    guests: number | null;
    types: string | null;
  };
}

// ── Compact Search Form ────────────────────────────────────────

function CompactSearchForm({
  defaultCheckIn,
  defaultCheckOut,
  defaultGuests,
}: {
  defaultCheckIn: string | null;
  defaultCheckOut: string | null;
  defaultGuests: number | null;
}) {
  const router = useRouter();
  const [checkIn, setCheckIn] = useState(defaultCheckIn ?? "");
  const [checkOut, setCheckOut] = useState(defaultCheckOut ?? "");
  const [guests, setGuests] = useState(defaultGuests ?? 2);

  const today = new Date().toISOString().split("T")[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkIn || !checkOut || guests < 1) return;
    const params = new URLSearchParams();
    params.set("checkIn", checkIn);
    params.set("checkOut", checkOut);
    params.set("guests", String(guests));
    router.push(`/search?${params.toString()}`);
  };

  return (
    <form onSubmit={handleSubmit} className="stays__search-form">
      <div className="stays__search-field">
        <label className="stays__search-label">Incheckning</label>
        <input
          type="date"
          value={checkIn}
          min={today}
          onChange={(e) => {
            setCheckIn(e.target.value);
            if (checkOut && e.target.value >= checkOut) setCheckOut("");
          }}
          className="stays__search-input"
          required
        />
      </div>
      <div className="stays__search-field">
        <label className="stays__search-label">Utcheckning</label>
        <input
          type="date"
          value={checkOut}
          min={checkIn || today}
          onChange={(e) => setCheckOut(e.target.value)}
          className="stays__search-input"
          required
        />
      </div>
      <div className="stays__search-field stays__search-field--guests">
        <label className="stays__search-label">Gäster</label>
        <input
          type="number"
          value={guests}
          min={1}
          max={99}
          onChange={(e) => setGuests(parseInt(e.target.value, 10) || 1)}
          className="stays__search-input"
          required
        />
      </div>
      <button type="submit" className="stays__search-btn">
        <span className="material-symbols-rounded" style={{ fontSize: 20 }}>search</span>
        Sök
      </button>
    </form>
  );
}

// ── Room Category Card ─────────────────────────────────────────

function RoomCategoryCard({
  entry,
  searchParams,
}: {
  entry: AvailabilityEntry;
  searchParams: string;
}) {
  const { category, ratePlans, available, restrictionViolations } = entry;
  const lowestNightly = ratePlans.length > 0
    ? Math.min(...ratePlans.map((rp) => rp.nightlyAmount))
    : 0;
  const image = category.imageUrls[0];

  return (
    <div className="stays__card">
      <div className="stays__card-image">
        {image ? (
          <img src={image} alt={category.name} />
        ) : (
          <div className="stays__card-placeholder" />
        )}
      </div>
      <div className="stays__card-info">
        <div className="stays__card-type">{category.type}</div>
        <h3 className="stays__card-title">{category.name}</h3>
        <p className="stays__card-desc">{category.shortDescription}</p>
        <div className="stays__card-meta">
          <span className="material-symbols-rounded" style={{ fontSize: 16 }}>person</span>
          Upp till {category.maxGuests} gäster
        </div>
        {category.facilities.length > 0 && (
          <div className="stays__card-facilities">
            {category.facilities.slice(0, 4).map((f) => (
              <span key={f} className="stays__card-facility">{f}</span>
            ))}
          </div>
        )}
      </div>
      <div className="stays__card-action">
        {available ? (
          <>
            <div className="stays__card-price">
              Från {formatPriceDisplay(lowestNightly)} kr
              <span className="stays__card-price-unit">/natt</span>
            </div>
            <Link
              href={`/stays/${category.externalId}?${searchParams}`}
              className="stays__card-btn"
            >
              Välj
            </Link>
          </>
        ) : (
          <div className="stays__card-unavailable">
            {restrictionViolations.length > 0
              ? restrictionViolations[0]
              : "Ej tillgängligt"}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────

export function StaysClient({
  tenantId,
  initialData,
  initialError,
  initialParams,
}: StaysClientProps) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<AvailabilityResponse | null>(initialData);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [loaded, setLoaded] = useState(!!initialData || !!initialError);

  const checkIn = searchParams.get("checkIn") ?? initialParams.checkIn;
  const checkOut = searchParams.get("checkOut") ?? initialParams.checkOut;
  const guests = searchParams.get("guests")
    ? parseInt(searchParams.get("guests")!, 10)
    : initialParams.guests;
  const hasSearch = !!(checkIn && checkOut && guests && guests > 0);

  // Re-fetch when URL params change (after compact form submit)
  useEffect(() => {
    if (!hasSearch) return;
    if (initialData && initialData.searchParams.checkIn === checkIn && initialData.searchParams.checkOut === checkOut && initialData.searchParams.guests === guests) return;

    let cancelled = false;
    const params = new URLSearchParams();
    params.set("tenantId", tenantId);
    params.set("checkIn", checkIn!);
    params.set("checkOut", checkOut!);
    params.set("guests", String(guests));

    fetch(`/api/availability?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) throw new Error("Fetch failed");
        const json = await res.json();
        setData(json);
        setError(null);
        track({
          tenantId,
          eventType: "SEARCH_PERFORMED",
          payload: {
            checkIn,
            checkOut,
            guests,
            resultCount: json.results?.length ?? 0,
          },
        });
      })
      .catch(() => { if (!cancelled) setError("Kunde inte hämta tillgänglighet. Försök igen."); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [checkIn, checkOut, guests, tenantId, hasSearch, initialData]);

  // Build search params string for category links
  const searchParamsStr = hasSearch
    ? `checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`
    : "";

  return (
    <div className="stays">
      {/* Compact search */}
      <div className="stays__search-bar">
        <CompactSearchForm
          defaultCheckIn={checkIn}
          defaultCheckOut={checkOut}
          defaultGuests={guests}
        />
      </div>

      {!hasSearch ? (
        /* Empty state — no search */
        <div className="stays__empty">
          <span className="material-symbols-rounded" style={{ fontSize: 48, opacity: 0.15 }}>travel_explore</span>
          <h2 className="stays__empty-title">Sök lediga boenden</h2>
          <p className="stays__empty-text">
            Välj datum och antal gäster för att se tillgänglighet.
          </p>
        </div>
      ) : !loaded ? (
        /* Loading */
        <div className="stays__grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stays__card stays__card--skeleton">
              <div className="stays__card-image stays__skeleton-pulse" />
              <div className="stays__card-info">
                <div className="stays__skeleton-line stays__skeleton-line--sm" />
                <div className="stays__skeleton-line" />
                <div className="stays__skeleton-line stays__skeleton-line--lg" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        /* Error */
        <div className="stays__empty">
          <p className="stays__empty-text" style={{ color: "#dc2626" }}>{error}</p>
          <button className="stays__card-btn" onClick={() => window.location.reload()}>
            Försök igen
          </button>
        </div>
      ) : data && data.results.length > 0 ? (
        /* Results */
        <>
          <div className="stays__results-header">
            <span>
              {data.results.length} boende{data.results.length !== 1 ? "n" : ""} ·{" "}
              {formatDateRange(new Date(data.searchParams.checkIn), new Date(data.searchParams.checkOut))} ·{" "}
              {data.searchParams.nights} nätter · {data.searchParams.guests} gäster
            </span>
          </div>
          <div className="stays__grid">
            {data.results.map((entry) => (
              <RoomCategoryCard
                key={entry.category.externalId}
                entry={entry}
                searchParams={searchParamsStr}
              />
            ))}
          </div>
        </>
      ) : (
        /* No results */
        <div className="stays__empty">
          <span className="material-symbols-rounded" style={{ fontSize: 48, opacity: 0.15 }}>hotel</span>
          <h2 className="stays__empty-title">Inga lediga boenden</h2>
          <p className="stays__empty-text">
            Inga lediga boenden hittades för dessa datum. Prova andra datum.
          </p>
        </div>
      )}
    </div>
  );
}
