"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { CreateMapModal } from "./CreateMapModal";
import "@/app/(admin)/products/products.css";
import "./spot-map-list.css";

// ── Types ───────────────────────────────────────────────────────

type SpotMapSummary = {
  id: string;
  title: string;
  imageUrl: string;
  addonPrice: number;
  currency: string;
  isActive: boolean;
  markerCount: number;
  accommodationNames: string[];
};

type AccommodationOption = {
  id: string;
  name: string;
  categoryTitle: string;
};

type Props = {
  maps: SpotMapSummary[];
  accommodations: AccommodationOption[];
};

// ── Helpers ─────────────────────────────────────────────────────

function formatPrice(ore: number, currency: string): string {
  const amount = Math.round(ore / 100);
  return `${amount} ${currency}`;
}

// ── Component ───────────────────────────────────────────────────

export function SpotMapList({ maps, accommodations }: Props) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [, startTransition] = useTransition();

  const filteredMaps = maps.filter((m) => {
    if (statusFilter === "ACTIVE") return m.isActive;
    if (statusFilter === "INACTIVE") return !m.isActive;
    return true;
  });

  function handleCreated() {
    setShowCreate(false);
    startTransition(() => router.refresh());
  }

  return (
    <div className="admin-page admin-page--no-preview sml__page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img
              src="https://res.cloudinary.com/dmgmoisae/image/upload/q_auto/f_auto/v1775408407/CIqiqqXsiIADEAE_uh5a5l.png"
              alt=""
              width={27}
              height={27}
              style={{ borderRadius: 4, border: "1px solid var(--admin-border)" }}
            />
            Platsbokning
          </h1>
          <div className="admin-actions">
            <button
              className="settings-btn--connect"
              style={{ fontSize: 13, padding: "5px 12px" }}
              onClick={() => setShowCreate(true)}
              disabled={accommodations.length === 0}
            >
              Skapa ny karta
            </button>
          </div>
        </div>
        <div className="admin-content">

      {maps.length === 0 ? (
        <div className="sml__empty">
          <EditorIcon name="map" size={40} />
          <p className="sml__empty-title">Inga kartor</p>
          <p className="sml__empty-desc">
            Skapa din forsta karta for att lata gaster valja plats.
          </p>
        </div>
      ) : (
        <>
          {/* Filter bar */}
          <div className="products-filter-bar">
            {([
              { key: "ALL", label: "Alla" },
              { key: "ACTIVE", label: "Aktiva" },
              { key: "INACTIVE", label: "Inaktiva" },
            ] as const).map((f) => (
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

          {/* Column headers */}
          <div className="files-column-headers">
            <span className="products-col products-col--thumb" />
            <span className="products-col products-col--name">Karta</span>
            <span className="products-col products-col--detail">Status</span>
            <span className="products-col products-col--detail">Platser</span>
            <span className="products-col products-col--detail products-col--right">Tillägg</span>
          </div>

          {/* Map rows */}
          <div className="products-inner">
            {filteredMaps.map((m) => (
              <div
                key={m.id}
                className="products-row"
                onClick={() => router.push(`/apps/spot-booking/${m.id}`)}
              >
                <div className="products-col products-col--thumb">
                  <img src={m.imageUrl} alt={m.title} className="products-thumb" />
                </div>
                <div className="products-col products-col--name">
                  <span className="products-row__title">
                    {m.accommodationNames[0] ?? m.title}
                    {m.accommodationNames.length > 1 && ` + ${m.accommodationNames.length - 1}`}
                  </span>
                </div>
                <div className="products-col products-col--detail">
                  <span className={`products-status ${m.isActive ? "products-status--active" : "products-status--archived"}`}>
                    {m.isActive ? "Aktiv" : "Inaktiv"}
                  </span>
                </div>
                <div className="products-col products-col--detail">
                  {m.markerCount} {m.markerCount === 1 ? "plats" : "platser"}
                </div>
                <div className="products-col products-col--detail products-col--right">
                  {formatPrice(m.addonPrice, m.currency)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateMapModal
          accommodations={accommodations}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
