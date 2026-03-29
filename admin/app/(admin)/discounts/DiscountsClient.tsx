"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { DiscountStatusBadge } from "./_components/DiscountStatusBadge";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { Loading } from "@/app/_components/Loading/Loading";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";
import type { DiscountStatus, DiscountMethod, DiscountValueType } from "@prisma/client";

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

const TABS: { key: string; label: string; status?: string }[] = [
  { key: "all", label: "Alla" },
  { key: "active", label: "Aktiva", status: "ACTIVE" },
  { key: "scheduled", label: "Schemalagda", status: "SCHEDULED" },
  { key: "expired", label: "Utgångna", status: "EXPIRED" },
  { key: "disabled", label: "Avaktiverade", status: "DISABLED" },
];

function formatValue(valueType: DiscountValueType, value: number): string {
  if (valueType === "PERCENTAGE") {
    return `${value / 100}%`;
  }
  return `${formatPriceDisplay(value, "SEK")} kr`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function DiscountsClient({ onCreateClick }: { onCreateClick?: () => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const statusParam = searchParams.get("status") ?? "";

  const activeTab = TABS.find((t) => t.status === statusParam)?.key ?? "all";

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchDiscounts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusParam) params.set("status", statusParam);
    params.set("page", String(page));
    params.set("limit", "20");

    const res = await fetch(`/api/admin/discounts?${params}`);
    if (res.ok) {
      setData(await res.json());
    }
    setLoading(false);
  }, [statusParam, page]);

  useEffect(() => {
    fetchDiscounts();
  }, [fetchDiscounts]);

  const switchTab = (tab: typeof TABS[number]) => {
    setPage(1);
    if (tab.status) {
      router.push(`/discounts?status=${tab.status}`);
    } else {
      router.push("/discounts");
    }
  };

  // Empty state
  if (!loading && data && data.total === 0 && activeTab === "all") {
    return (
      <>
        <div className="disc-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`disc-tab${activeTab === tab.key ? " disc-tab--active" : ""}`}
              onClick={() => switchTab(tab)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="disc-empty">
          <div className="disc-empty__icon">
            <EditorIcon name="sell" size={48} />
          </div>
          <h2 className="disc-empty__title">Inga rabatter skapade</h2>
          <p className="disc-empty__desc">
            Skapa din första rabatt för att erbjuda dina gäster prisavdrag vid bokning eller köp.
          </p>
          <button className="settings-btn--connect" onClick={onCreateClick}>
            Skapa rabatt
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Tabs */}
      <div className="disc-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`disc-tab${activeTab === tab.key ? " disc-tab--active" : ""}`}
            onClick={() => switchTab(tab)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 48, display: "flex", justifyContent: "center" }}>
          <Loading variant="section" />
        </div>
      ) : data && data.discounts.length > 0 ? (
        <div className="disc-table">
          {/* Header */}
          <div className="disc-header">
            <span>Titel</span>
            <span>Metod</span>
            <span>Värde</span>
            <span>Användningar</span>
            <span>Status</span>
            <span>Giltig t.o.m</span>
            <span></span>
          </div>

          {/* Rows */}
          {data.discounts.map((d) => (
            <Link
              key={d.id}
              href={`/discounts/${d.id}`}
              className="disc-row"
            >
              <span className="disc-row__title">{d.title}</span>
              <span className="disc-row__method">
                <span
                  style={{
                    background: d.method === "CODE" ? "#E8F0FE" : "#F0E8FE",
                    color: d.method === "CODE" ? "#1A4B8E" : "#5E1A8E",
                    borderRadius: 8,
                    padding: "2px 8px",
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  {d.method === "CODE" ? "Kod" : "Automatisk"}
                </span>
              </span>
              <span className="disc-row__value">{formatValue(d.valueType, d.value)}</span>
              <span className="disc-row__usage">
                {d.usageCount}{d.usageLimit ? ` / ${d.usageLimit}` : " / \u221E"}
              </span>
              <span>
                <DiscountStatusBadge status={d.status} />
              </span>
              <span className="disc-row__date">
                {d.endsAt ? formatDate(d.endsAt) : "\u2013"}
              </span>
              <span className="disc-row__action">
                <EditorIcon name="chevron_right" size={18} />
              </span>
            </Link>
          ))}

          {/* Pagination */}
          {data.total > data.pageSize && (
            <div className="disc-pagination">
              <button
                className="disc-pagination__btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <EditorIcon name="chevron_left" size={16} />
              </button>
              <span className="disc-pagination__info">
                Sida {data.page} av {Math.ceil(data.total / data.pageSize)}
              </span>
              <button
                className="disc-pagination__btn"
                disabled={page >= Math.ceil(data.total / data.pageSize)}
                onClick={() => setPage((p) => p + 1)}
              >
                <EditorIcon name="chevron_right" size={16} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="disc-empty">
          <p className="disc-empty__desc">Inga rabatter matchar filtret.</p>
        </div>
      )}
    </>
  );
}
