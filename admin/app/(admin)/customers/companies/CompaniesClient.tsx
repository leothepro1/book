"use client";

/**
 * CompaniesClient — mirrors CustomersClient / SegmentsClient patterns.
 *
 *   - `.cst-filter-bar`      — header bar containing status chips + search
 *   - `.cst-filter-btn`      — All / Active / Archived / Pending tabs
 *   - `.cst-search`          — debounced search input
 *   - `.cst-column-headers`  — column header row
 *   - `.cst-row`             — clickable data rows
 *   - `.cst-col--name/--marketing/--location/--orders/--spent` — column widths
 *   - `.cst-empty`           — illustrated empty state
 *   - `.files-pagination`    — cursor pagination footer
 *
 * Zero new CSS — every class already lives in customers.css + files.css.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";

type CompanyStatus = "ACTIVE" | "ARCHIVED";

interface Row {
  id: string;
  name: string;
  mainContactName: string | null;
  locationCount: number;
  createdAt: string;
  status: CompanyStatus;
  orderingApproved: boolean;
}

type FilterKey = "all" | "ACTIVE" | "ARCHIVED" | "pending";

interface Props {
  rows: Row[];
  currentFilter: FilterKey;
  currentQuery: string;
  currentCursor: string | null;
  nextCursor: string | null;
  counts: Record<FilterKey, number>;
}

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "Alla",
  ACTIVE: "Aktiva",
  ARCHIVED: "Arkiverade",
  pending: "Väntar godkännande",
};

const FILTER_ORDER: FilterKey[] = ["all", "ACTIVE", "ARCHIVED", "pending"];

function statusLabel(status: CompanyStatus, orderingApproved: boolean): {
  label: string;
  bg: string;
  color: string;
} {
  if (status === "ARCHIVED") {
    return { label: "Arkiverad", bg: "#E5E7EB", color: "#374151" };
  }
  if (!orderingApproved) {
    return { label: "Väntar godkännande", bg: "#FEF3C7", color: "#92400E" };
  }
  return { label: "Aktiv", bg: "#D1FAE5", color: "#065F46" };
}

function formatDateSv(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const month = d
    .toLocaleDateString("sv-SE", { month: "short" })
    .replace(".", "");
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

export default function CompaniesClient({
  rows,
  currentFilter,
  currentQuery,
  currentCursor,
  nextCursor,
  counts,
}: Props) {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState(currentQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search → URL push (same 300ms as CustomersClient).
  useEffect(() => {
    if (searchQuery === currentQuery) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (currentFilter !== "all") params.set("filter", currentFilter);
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      router.push(
        params.toString()
          ? `/customers/companies?${params.toString()}`
          : "/customers/companies",
      );
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  function filterHref(key: FilterKey): string {
    const params = new URLSearchParams();
    if (key !== "all") params.set("filter", key);
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    return params.toString()
      ? `/customers/companies?${params.toString()}`
      : "/customers/companies";
  }

  // ── Empty state (no companies AND no active filter/search) ──
  if (
    rows.length === 0 &&
    currentFilter === "all" &&
    !currentQuery &&
    counts.all === 0
  ) {
    return (
      <div className="cst-empty">
        <div className="cst-empty__icon">
          <EditorIcon name="domain" size={48} />
        </div>
        <h2 className="cst-empty__title">Inga företag ännu</h2>
        <p className="cst-empty__desc">
          Företagskunder visas här när du lägger till dem.
        </p>
        <button
          className="settings-btn--connect"
          style={{ fontSize: 14, padding: "8px 20px" }}
          onClick={() => router.push("/customers/companies/new")}
        >
          Skapa företag
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Filter bar — chips left, search right (mirrors CustomersClient layout) */}
      <div className="cst-filter-bar">
        {FILTER_ORDER.map((key) => {
          const isActive = key === currentFilter;
          return (
            <a
              key={key}
              href={filterHref(key)}
              className={`cst-filter-btn${isActive ? " cst-filter-btn--active" : ""}`}
            >
              {FILTER_LABELS[key]} ({counts[key]})
            </a>
          );
        })}
        <div className="cst-filter-bar__actions">
          <div className="cst-search" style={{ width: 220 }}>
            <span className="material-symbols-rounded cst-search__icon">
              search
            </span>
            <input
              type="text"
              className="cst-search__input"
              placeholder="Sök företag"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div className="cst-column-headers">
        <span className="cst-col cst-col--name">Namn</span>
        <span className="cst-col cst-col--marketing">Huvudkontakt</span>
        <span className="cst-col cst-col--orders">Platser</span>
        <span className="cst-col cst-col--location">Skapad</span>
        <span className="cst-col cst-col--spent">Status</span>
      </div>

      {/* Rows */}
      {rows.length === 0 ? (
        <div className="cst-empty-filtered">Inga företag matchar filtret</div>
      ) : (
        rows.map((row) => {
          const status = statusLabel(row.status, row.orderingApproved);
          return (
            <div
              key={row.id}
              className="cst-row"
              onClick={() => router.push(`/customers/companies/${row.id}`)}
            >
              <div className="cst-col cst-col--name">
                <span className="cst-row__name">{row.name}</span>
              </div>
              <div className="cst-col cst-col--marketing">
                <span style={{ fontSize: 13 }}>
                  {row.mainContactName ?? "—"}
                </span>
              </div>
              <div className="cst-col cst-col--orders">
                <span style={{ fontSize: 13 }}>
                  {row.locationCount === 0
                    ? "—"
                    : `${row.locationCount} ${row.locationCount === 1 ? "plats" : "platser"}`}
                </span>
              </div>
              <div className="cst-col cst-col--location">
                <span className="cst-row__location">
                  {formatDateSv(row.createdAt)}
                </span>
              </div>
              <div className="cst-col cst-col--spent">
                <span
                  style={{
                    display: "inline-block",
                    background: status.bg,
                    color: status.color,
                    borderRadius: 8,
                    padding: "2px 8px",
                    fontSize: 12,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  {status.label}
                </span>
              </div>
            </div>
          );
        })
      )}

      {/* Pagination — cursor-based; uses files-pagination classes */}
      {(currentCursor || nextCursor) && (
        <div className="files-pagination">
          <div className="files-pagination__nav">
            <a
              className="files-pagination__btn"
              aria-disabled={!currentCursor}
              href={(() => {
                const p = new URLSearchParams();
                if (currentFilter !== "all") p.set("filter", currentFilter);
                if (searchQuery.trim()) p.set("q", searchQuery.trim());
                return p.toString()
                  ? `/customers/companies?${p.toString()}`
                  : "/customers/companies";
              })()}
              aria-label="Första sidan"
              style={currentCursor ? undefined : { pointerEvents: "none", opacity: 0.4 }}
            >
              <EditorIcon name="chevron_left" size={20} />
            </a>
            <a
              className="files-pagination__btn"
              aria-disabled={!nextCursor}
              href={(() => {
                if (!nextCursor) return "#";
                const p = new URLSearchParams();
                if (currentFilter !== "all") p.set("filter", currentFilter);
                if (searchQuery.trim()) p.set("q", searchQuery.trim());
                p.set("cursor", nextCursor);
                return `/customers/companies?${p.toString()}`;
              })()}
              aria-label="Nästa sida"
              style={nextCursor ? undefined : { pointerEvents: "none", opacity: 0.4 }}
            >
              <EditorIcon name="chevron_right" size={20} />
            </a>
          </div>
        </div>
      )}
    </>
  );
}
