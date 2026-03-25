"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { listGiftCardProducts } from "@/app/_lib/gift-cards/actions";
import type { GiftCardProductItem } from "@/app/_lib/gift-cards/actions";
import { formatPriceDisplay } from "@/app/_lib/products/pricing";

function statusLabel(status: string): { label: string; className: string } {
  switch (status) {
    case "ACTIVE": return { label: "Aktiv", className: "products-status--active" };
    case "DRAFT": return { label: "Utkast", className: "products-status--draft" };
    default: return { label: status, className: "" };
  }
}

export default function GiftCardsClient() {
  const router = useRouter();
  const [products, setProducts] = useState<GiftCardProductItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    listGiftCardProducts().then((data) => {
      setProducts(data);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return null;

  // Empty state
  if (products.length === 0) {
    return (
      <div className="gc-admin-empty">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://res.cloudinary.com/dmgmoisae/image/upload/v1774446466/empty-state-gift-cards-3c9e695f598a_pwza26.svg"
          alt=""
          className="gc-admin-empty__image"
        />
        <h3 className="gc-admin-empty__title">Börja sälja presentkort</h3>
        <p className="gc-admin-empty__desc">
          Lägg till presentkortsprodukter att sälja eller skapa presentkort och skicka dem direkt till kunderna.
        </p>
        <button
          type="button"
          className="gc-admin-empty__btn"
          onClick={() => router.push("/gift-cards/new")}
        >
          Skapa presentkort
        </button>
      </div>
    );
  }

  // List view
  return (
    <div>
      <div className="files-column-headers">
        <span className="gc-list-col gc-list-col--name">Presentkort</span>
        <span className="gc-list-col gc-list-col--status">Status</span>
        <span className="gc-list-col gc-list-col--designs">Mallar</span>
        <span className="gc-list-col gc-list-col--amount">Belopp</span>
      </div>

      {products.map((p) => {
        const { label, className } = statusLabel(p.status);
        return (
          <div
            key={p.id}
            className="products-row"
            onClick={() => router.push(`/gift-cards/${p.id}/configure`)}
          >
            <div className="gc-list-col gc-list-col--name">
              <span className="products-row__title">{p.title}</span>
            </div>
            <div className="gc-list-col gc-list-col--status">
              <span className={`products-status ${className}`}>{label}</span>
            </div>
            <div className="gc-list-col gc-list-col--designs">
              {p.designCount} {p.designCount === 1 ? "mall" : "mallar"}
            </div>
            <div className="gc-list-col gc-list-col--amount">
              {formatPriceDisplay(p.minAmount, "SEK")} – {formatPriceDisplay(p.maxAmount, "SEK")} kr
            </div>
          </div>
        );
      })}
    </div>
  );
}
