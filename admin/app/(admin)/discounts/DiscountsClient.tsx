"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import type { DiscountStatus, DiscountMethod, DiscountValueType } from "@prisma/client";

// ── Types ────────────────────────────────────────────────────

type DiscountListItem = {
  id: string;
  title: string;
  method: DiscountMethod;
  valueType: DiscountValueType;
  value: number;
  status: DiscountStatus;
  usageCount: number;
  usageLimit: number | null;
  endsAt: string | null;
  createdAt: string;
  codes: { id: string; code: string }[];
  _count: { usages: number };
};

type ListResponse = {
  discounts: DiscountListItem[];
  total: number;
  page: number;
  pageSize: number;
};

// ── Helpers ──────────────────────────────────────────────────

function formatValue(valueType: DiscountValueType, value: number): string {
  if (valueType === "PERCENTAGE") return `${value / 100}%`;
  return `${formatPriceDisplay(value, "SEK")} kr`;
}

function statusLabel(status: DiscountStatus): { label: string; className: string } {
  switch (status) {
    case "ACTIVE": return { label: "Aktiv", className: "products-status--active" };
    case "SCHEDULED": return { label: "Schemalagd", className: "products-status--draft" };
    case "EXPIRED": return { label: "Utgången", className: "products-status--archived" };
    case "DISABLED": return { label: "Avaktiverad", className: "products-status--archived" };
    default: return { label: status, className: "" };
  }
}

function methodLabel(method: DiscountMethod): string {
  return method === "CODE" ? "Kod" : "Automatisk";
}

// ── Filters ─────────────────────────────────────────────────

type StatusFilter = "ALL" | "ACTIVE" | "SCHEDULED" | "EXPIRED" | "DISABLED";

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "ALL", label: "Alla" },
  { key: "ACTIVE", label: "Aktiva" },
  { key: "SCHEDULED", label: "Schemalagda" },
  { key: "EXPIRED", label: "Utgångna" },
  { key: "DISABLED", label: "Avaktiverade" },
];

// ── Component ────────────────────────────────────────────────

export function DiscountsClient({ onCreateClick }: { onCreateClick?: () => void }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [data, setData] = useState<ListResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchDiscounts = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    params.set("page", "1");
    params.set("limit", "50");

    const res = await fetch(`/api/admin/discounts?${params}`);
    if (res.ok) {
      setData(await res.json());
    }
    setLoaded(true);
  }, [statusFilter]);

  useEffect(() => {
    fetchDiscounts();
  }, [fetchDiscounts]);

  if (!loaded) return null;

  const discounts = data?.discounts ?? [];

  // ── Empty state ──
  if (discounts.length === 0 && statusFilter === "ALL") {
    return (
      <>
        <div className="products-filter-bar">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`products-filter-btn${statusFilter === f.key ? " products-filter-btn--active" : ""}`}
              onClick={() => setStatusFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="products-empty">
          <div className="products-empty__icon">
            <EditorIcon name="percent" size={48} />
          </div>
          <h2 className="products-empty__title">Inga rabatter skapade</h2>
          <p className="products-empty__desc">
            Skapa din första rabatt för att erbjuda dina gäster prisavdrag vid bokning eller köp.
          </p>
          <button
            className="settings-btn--connect"
            style={{ fontSize: 14, padding: "8px 20px" }}
            onClick={onCreateClick}
          >
            Skapa rabatt
          </button>
        </div>
      </>
    );
  }

  // ── Column header ──
  const columnHeader = (
    <div className="files-column-headers">
      <span className="products-col products-col--name">Rabatt</span>
      <span className="products-col products-col--detail">Status</span>
      <span className="products-col products-col--detail">Metod</span>
      <span className="products-col products-col--detail">Värde</span>
      <span className="products-col products-col--detail">Användningar</span>
    </div>
  );

  return (
    <>
      <div className="products-filter-bar">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`products-filter-btn${statusFilter === f.key ? " products-filter-btn--active" : ""}`}
            onClick={() => setStatusFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="products-inner">
        {columnHeader}

        {discounts.map((d) => {
          const { label: sLabel, className: sClass } = statusLabel(d.status);

          return (
            <div
              key={d.id}
              className="products-row"
              onClick={() => router.push(`/discounts/${d.id}`)}
            >
              <div className="products-col products-col--name">
                <span className="products-row__title">{d.title}</span>
                {d.codes.length > 0 && (
                  <span className="products-row__meta">{d.codes[0].code}</span>
                )}
              </div>
              <div className="products-col products-col--detail">
                <span className={`products-status ${sClass}`}>{sLabel}</span>
              </div>
              <div className="products-col products-col--detail">
                <span style={{
                  background: d.method === "CODE" ? "#E8F0FE" : "#F0E8FE",
                  color: d.method === "CODE" ? "#1A4B8E" : "#5E1A8E",
                  borderRadius: 7,
                  padding: "2px 8px",
                  fontSize: 12,
                  fontWeight: 500,
                }}>
                  {methodLabel(d.method)}
                </span>
              </div>
              <div className="products-col products-col--detail">
                {formatValue(d.valueType, d.value)}
              </div>
              <div className="products-col products-col--detail">
                {d.usageCount}{d.usageLimit ? ` / ${d.usageLimit}` : " / \u221E"}
              </div>
            </div>
          );
        })}

        {discounts.length === 0 && statusFilter !== "ALL" && (
          <div className="products-empty" style={{ padding: "40px 24px" }}>
            <p className="products-empty__desc" style={{ margin: 0 }}>
              Inga rabatter matchar filtret.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
