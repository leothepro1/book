"use client";

import { useState, useCallback, useEffect, useRef, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { listProducts, archiveProduct } from "@/app/_lib/products";

// ── Types ────────────────────────────────────────────────────

type ProductListItem = {
  id: string;
  title: string;
  slug: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  price: number;
  currency: string;
  trackInventory: boolean;
  inventoryQuantity: number;
  media: Array<{ url: string; alt: string }>;
  variants: Array<{ id: string; price: number; option1: string | null; trackInventory: boolean; inventoryQuantity: number }>;
  collectionItems: Array<{ collection: { id: string; title: string } }>;
  _count: { variants: number; collectionItems: number };
};

// ── Helpers ──────────────────────────────────────────────────

function formatPrice(amount: number, currency: string): string {
  const value = amount / 100;
  if (currency === "SEK") {
    return new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value) + " kr";
  }
  return new Intl.NumberFormat("sv-SE", { style: "currency", currency }).format(value);
}

function statusLabel(status: string): { label: string; className: string } {
  switch (status) {
    case "ACTIVE": return { label: "Aktiv", className: "products-status--active" };
    case "DRAFT": return { label: "Utkast", className: "products-status--draft" };
    case "ARCHIVED": return { label: "Arkiverad", className: "products-status--archived" };
    default: return { label: status, className: "" };
  }
}

function getDisplayPrice(p: ProductListItem): string {
  if (p._count.variants > 0 && p.variants.length > 0) {
    const prices = p.variants.map((v) => v.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) return formatPrice(min, p.currency);
    return `${formatPrice(min, p.currency)} – ${formatPrice(max, p.currency)}`;
  }
  return formatPrice(p.price, p.currency);
}

function getInventoryDisplay(p: ProductListItem): { text: string; outOfStock: boolean } {
  // Product with variants
  if (p._count.variants > 0 && p.variants.length > 0) {
    const tracked = p.variants.filter((v) => v.trackInventory);
    if (tracked.length === 0) return { text: "Lager spåras inte", outOfStock: false };
    const total = tracked.reduce((sum, v) => sum + v.inventoryQuantity, 0);
    if (total === 0) return { text: "0 i lager", outOfStock: true };
    return { text: `${total} i lager för ${tracked.length} ${tracked.length === 1 ? "variant" : "varianter"}`, outOfStock: false };
  }
  // Product without variants
  if (!p.trackInventory) return { text: "Lager spåras inte", outOfStock: false };
  if (p.inventoryQuantity === 0) return { text: "0 i lager", outOfStock: true };
  return { text: `${p.inventoryQuantity} i lager`, outOfStock: false };
}

function getCategoryLabel(p: ProductListItem): string {
  if (p._count.collectionItems === 0) return "Okategoriserat";
  const first = p.collectionItems[0]?.collection.title;
  if (!first) return "Okategoriserat";
  if (p._count.collectionItems === 1) return first;
  return `${first} +${p._count.collectionItems - 1}`;
}

// ── Component ────────────────────────────────────────────────

export default function ProductsClient({
  onAddRef,
}: {
  onAddRef: React.MutableRefObject<(() => void) | null>;
}) {
  const router = useRouter();
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [showSelectDropdown, setShowSelectDropdown] = useState(false);
  const selectDropdownRef = useRef<HTMLDivElement>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "DRAFT" | "ARCHIVED">("ALL");

  // Load all products once (filter client-side)
  useEffect(() => {
    listProducts({ includeArchived: true }).then((data) => {
      setProducts(data as ProductListItem[]);
      setLoaded(true);
    });
  }, []);

  const filteredProducts = statusFilter === "ALL"
    ? products
    : products.filter((p) => p.status === statusFilter);

  // Wire up add button
  useEffect(() => {
    onAddRef.current = () => router.push("/products/new");
    return () => { onAddRef.current = null; };
  }, [onAddRef, router]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showSelectDropdown) return;
    const handle = (e: MouseEvent) => {
      if (selectDropdownRef.current && !selectDropdownRef.current.contains(e.target as Node)) setShowSelectDropdown(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showSelectDropdown]);

  // Selection logic
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(products.map((p) => p.id)));
  }, [products]);

  const clearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selCount = selectedIds.size;
  const hasSelection = selCount > 0;
  const allSelected = products.length > 0 && selCount === products.length;
  const someSelected = hasSelection && !allSelected;

  const handleHeaderCheckbox = () => {
    if (allSelected || hasSelection) clearAll(); else selectAll();
  };

  const handleArchiveSelected = useCallback(() => {
    startTransition(async () => {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await archiveProduct(id);
      }
      setProducts((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
      setShowDeleteConfirm(false);
    });
  }, [selectedIds]);

  if (!loaded) return null;

  // ── Empty state ──
  if (products.length === 0) {
    return (
      <div className="products-empty">
        <div className="products-empty__icon">
          <EditorIcon name="sell" size={48} />
        </div>
        <h2 className="products-empty__title">Inga produkter ännu</h2>
        <p className="products-empty__desc">
          Skapa din första produkt — frukostbuffé, cykeluthyrning, välkomstpaket, eller vad du vill sälja.
        </p>
        <button
          className="settings-btn--connect"
          style={{ fontSize: 14, padding: "8px 20px" }}
          onClick={() => router.push("/products/new")}
        >
          Skapa produkt
        </button>
      </div>
    );
  }

  // ── Column header ──
  const columnHeader = hasSelection ? (
    <div className="files-column-headers files-column-headers--selection">
      <button
        type="button"
        role="checkbox"
        aria-checked={allSelected ? "true" : someSelected ? "mixed" : "false"}
        className={`files-header-check ${someSelected ? "files-header-check--partial" : allSelected ? "files-header-check--active" : ""}`}
        onClick={handleHeaderCheckbox}
      >
        <EditorIcon name={someSelected ? "remove" : "check"} size={14} className="files-header-check__icon" />
      </button>
      <span className="files-selection__label">
        {selCount} {selCount === 1 ? "vald" : "valda"}
      </span>
      <div style={{ position: "relative" }} ref={selectDropdownRef}>
        <button className="files-selection__chevron" onClick={() => setShowSelectDropdown(!showSelectDropdown)}>
          <EditorIcon name="expand_more" size={18} />
        </button>
        {showSelectDropdown && (
          <div className="files-selection__dropdown">
            <button className="files-selection__dropdown-item" onClick={() => { selectAll(); setShowSelectDropdown(false); }}>
              Markera alla {products.length} produkter
            </button>
            <button className="files-selection__dropdown-item" onClick={() => { clearAll(); setShowSelectDropdown(false); }}>
              Avmarkera alla
            </button>
          </div>
        )}
      </div>
      <button className="files-selection__delete" onClick={() => setShowDeleteConfirm(true)}>
        Arkivera {selCount === 1 ? "produkt" : "produkter"}
      </button>
    </div>
  ) : (
    <div className="files-column-headers">
      <button
        type="button"
        role="checkbox"
        aria-checked="false"
        className="files-header-check"
        onClick={handleHeaderCheckbox}
      >
        <EditorIcon name="check" size={14} className="files-header-check__icon" />
      </button>
      <span className="products-col products-col--thumb" />
      <span className="products-col products-col--name">Produkt</span>
      <span className="products-col products-col--detail">Status</span>
      <span className="products-col products-col--detail">Kategori</span>
      <span className="products-col products-col--detail">Lager</span>
      <span className="products-col products-col--detail products-col--right">Pris</span>
    </div>
  );

  const FILTERS: Array<{ key: typeof statusFilter; label: string }> = [
    { key: "ALL", label: "Alla" },
    { key: "ACTIVE", label: "Aktiva" },
    { key: "DRAFT", label: "Utkast" },
    { key: "ARCHIVED", label: "Arkiverade" },
  ];

  return (
    <>
      <div className="products-filter-bar">
        {FILTERS.map((f) => (
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

      {/* Product rows */}
      {filteredProducts.map((product) => {
        const checked = selectedIds.has(product.id);
        const { label: sLabel, className: sClass } = statusLabel(product.status);
        const imgUrl = product.media[0]?.url;

        return (
          <div
            key={product.id}
            className={`products-row${checked ? " products-row--selected" : ""}`}
            onClick={() => router.push(`/products/${product.id}`)}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={checked}
              className={`files-header-check${checked ? " files-header-check--active" : ""}`}
              onClick={(e) => { e.stopPropagation(); toggleSelect(product.id); }}
            >
              <EditorIcon name="check" size={14} className="files-header-check__icon" />
            </button>
            <div className="products-col products-col--thumb">
              {imgUrl ? (
                <img src={imgUrl} alt="" className="products-thumb" />
              ) : (
                <div className="products-thumb products-thumb--empty">
                  <EditorIcon name="image" size={18} />
                </div>
              )}
            </div>
            <div className="products-col products-col--name">
              <span className="products-row__title">{product.title}</span>
            </div>
            <div className="products-col products-col--detail">
              <span className={`products-status ${sClass}`}>{sLabel}</span>
            </div>
            <div className="products-col products-col--detail">
              <span className="products-category">{getCategoryLabel(product)}</span>
            </div>
            <div className="products-col products-col--detail">
              {(() => {
                const inv = getInventoryDisplay(product);
                return <span style={inv.outOfStock ? { color: "#B21321", fontWeight: 500 } : undefined}>{inv.text}</span>;
              })()}
            </div>
            <div className="products-col products-col--detail products-col--right">
              {getDisplayPrice(product)}
            </div>
          </div>
        );
      })}

      {/* Archive confirmation modal */}
      {showDeleteConfirm && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
          <div
            style={{
              position: "relative", zIndex: 1, background: "var(--admin-surface)",
              borderRadius: 16, padding: 24, width: 380,
              animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
              Arkivera {selCount === 1 ? "1 produkt" : `${selCount} produkter`}?
            </h3>
            <p style={{ fontSize: 14, color: "#616161", lineHeight: 1.6, marginBottom: 20 }}>
              {selCount === 1 ? "Produkten" : "Produkterna"} arkiveras och döljs från butiken. Du kan återställa dem senare.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="settings-btn--outline" onClick={() => setShowDeleteConfirm(false)}>
                Avbryt
              </button>
              <button
                className="settings-btn--danger-solid"
                disabled={isPending}
                onClick={handleArchiveSelected}
              >
                Arkivera
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
    </>
  );
}
