"use client";

import { useState } from "react";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { DataTable, type DataTableColumn } from "../_components/DataTable/DataTable";
import "./ui-lab.css";

/**
 * UI Lab — admin component showcase.
 *
 * Live demos of every shared admin primitive against realistic mock
 * data. Used to verify components before they roll out to feature
 * pages, and as a visual reference for new contributors.
 */

type DemoProduct = {
  id: string;
  title: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  category: string;
  inventory: { text: string; outOfStock: boolean };
  price: string;
  imageUrl?: string;
};

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: "p1",
    title: "Frukostbuffé — Vuxen",
    status: "ACTIVE",
    category: "Frukost",
    inventory: { text: "Lager spåras inte", outOfStock: false },
    price: "189 kr",
  },
  {
    id: "p2",
    title: "Cykeluthyrning — Halvdag",
    status: "ACTIVE",
    category: "Aktiviteter",
    inventory: { text: "12 i lager", outOfStock: false },
    price: "150 kr",
  },
  {
    id: "p3",
    title: "Välkomstpaket — Premium",
    status: "DRAFT",
    category: "Välkomst",
    inventory: { text: "0 i lager", outOfStock: true },
    price: "450 kr",
  },
  {
    id: "p4",
    title: "Bastusvit — 1 timme",
    status: "ACTIVE",
    category: "Spa",
    inventory: { text: "8 i lager för 2 varianter", outOfStock: false },
    price: "390 – 590 kr",
  },
  {
    id: "p5",
    title: "Picknickkorg",
    status: "ARCHIVED",
    category: "Mat & dryck",
    inventory: { text: "Lager spåras inte", outOfStock: false },
    price: "295 kr",
  },
  {
    id: "p6",
    title: "Sen utcheckning",
    status: "ACTIVE",
    category: "Okategoriserat",
    inventory: { text: "Lager spåras inte", outOfStock: false },
    price: "100 kr",
  },
];

const FILTERS = [
  { key: "ALL", label: "Alla" },
  { key: "ACTIVE", label: "Aktiva" },
  { key: "DRAFT", label: "Utkast" },
  { key: "ARCHIVED", label: "Arkiverade" },
];

function statusBadge(status: DemoProduct["status"]) {
  const map = {
    ACTIVE: { label: "Aktiv", cls: "demo-status--active" },
    DRAFT: { label: "Utkast", cls: "demo-status--draft" },
    ARCHIVED: { label: "Arkiverad", cls: "demo-status--archived" },
  } as const;
  const { label, cls } = map[status];
  return <span className={`demo-status ${cls}`}>{label}</span>;
}

export default function UiLabPage() {
  const [statusFilter, setStatusFilter] = useState("ALL");

  const columns: DataTableColumn<DemoProduct>[] = [
    {
      key: "thumb",
      width: "thumb",
      render: (p) =>
        p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt="" className="dt-thumb" />
        ) : (
          <div className="dt-thumb dt-thumb--empty">
            <EditorIcon name="image" size={18} />
          </div>
        ),
    },
    {
      key: "name",
      header: "Produkt",
      width: "main",
      render: (p) => <span className="dt-row__title">{p.title}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "detail",
      render: (p) => statusBadge(p.status),
    },
    {
      key: "category",
      header: "Kategori",
      width: "detail",
      render: (p) => p.category,
    },
    {
      key: "inventory",
      header: "Lager",
      width: "detail",
      render: (p) => (
        <span
          style={
            p.inventory.outOfStock
              ? { color: "var(--admin-danger)", fontWeight: 500 }
              : undefined
          }
        >
          {p.inventory.text}
        </span>
      ),
    },
    {
      key: "price",
      header: "Pris",
      width: "detail",
      align: "right",
      render: (p) => p.price,
    },
  ];

  return (
    <div className="admin-page admin-page--no-preview ui-lab-page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1
            className="admin-title"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>
              science
            </span>
            UI lab
          </h1>
        </div>

        <div className="ui-lab__section-label">DataTable</div>
        <div className="admin-content">
          <DataTable<DemoProduct>
            data={DEMO_PRODUCTS}
            rowKey={(p) => p.id}
            columns={columns}
            filters={FILTERS}
            activeFilter={statusFilter}
            onFilterChange={setStatusFilter}
            filterPredicate={(p, key) => key === "ALL" || p.status === key}
            selectable
            bulkActions={(ids, { clear }) => (
              <button
                className="ui-lab-bulk-btn"
                onClick={() => {
                  alert(`Bulk action på ${ids.size} produkter (demo)`);
                  clear();
                }}
              >
                Arkivera {ids.size === 1 ? "produkt" : "produkter"}
              </button>
            )}
            onRowClick={(p) => alert(`Klick på "${p.title}" (demo)`)}
            empty={{
              icon: "sell",
              title: "Inga produkter ännu",
              desc: "Skapa din första produkt — frukostbuffé, cykeluthyrning, välkomstpaket, eller vad du vill sälja.",
              cta: { label: "Skapa produkt", onClick: () => {} },
            }}
          />
        </div>
      </div>
    </div>
  );
}
