/**
 * Loading skeleton for /customers/companies/new — mirrors
 * CompanyCreateForm exactly:
 *   • pf-header breadcrumb
 *   • pf-body two-column split
 *     - pf-main (70%): Företagsuppgifter, Huvudkontakt, Faktureringsadress
 *     - pf-sidebar (30%): Anteckningar, Organisering, Betalningsvillkor, Skatt
 *
 * Real CARD containers (box-shadow, radius, padding) render as-is so
 * the layout doesn't shift when CompanyCreateForm mounts. Only inputs,
 * labels content and titles shimmer.
 */

import { EditorIcon } from "@/app/_components/EditorIcon";
import "@/app/(admin)/products/_components/product-form.css";
import "@/app/(admin)/orders/orders.css";
import "../../customers.css";
import "../_components/companies.css";

const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

export default function CompanyCreateLoading() {
  return (
    <div className="admin-page admin-page--no-preview products-page">
      <div className="admin-editor">
        {/* Header */}
        <div className="admin-header pf-header">
          <h1
            className="admin-title"
            style={{ display: "flex", alignItems: "center", gap: 0 }}
          >
            <span
              className="menus-breadcrumb__icon"
              style={{ display: "inline-flex" }}
            >
              <span
                className="material-symbols-rounded"
                style={{ fontSize: 22 }}
              >
                domain
              </span>
            </span>
            <EditorIcon
              name="chevron_right"
              size={16}
              style={{
                color: "var(--admin-text-tertiary)",
                flexShrink: 0,
              }}
            />
            <span style={{ marginLeft: 3 }}>Skapa företag</span>
          </h1>
          <div className="pf-header__actions">
            <span
              className="sk sk--btn"
              style={{ width: 120 }}
              aria-hidden
            />
          </div>
        </div>

        {/* Body */}
        <div className="pf-body">
          {/* ── Main column (70%) ───────────────────────────── */}
          <div className="pf-main">
            {/* Företagsuppgifter */}
            <div style={CARD}>
              <FieldSkeleton label="Företagsnamn" />
              <FieldSkeleton label="Externt ID" />
              <FieldSkeleton label="Organisationsnummer" last />
            </div>

            {/* Huvudkontakt */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Huvudkontakt</span>
              </div>
              <div className="pf-field" style={{ marginBottom: 0 }}>
                <label className="admin-label">Kund</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <span
                    className="sk sk--input"
                    style={{ flex: 1 }}
                    aria-hidden
                  />
                  <span
                    className="sk sk--btn"
                    style={{ width: 92 }}
                    aria-hidden
                  />
                </div>
              </div>
            </div>

            {/* Faktureringsadress */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Faktureringsadress</span>
              </div>
              <FieldSkeleton label="Gatuadress" />
              <FieldSkeleton label="Adresstillägg" />
              <div
                className="pf-field"
                style={{ display: "flex", gap: 8, alignItems: "flex-end" }}
              >
                <div style={{ flex: 1 }}>
                  <label className="admin-label">Postnummer</label>
                  <span
                    className="sk sk--input"
                    style={{ width: "100%" }}
                    aria-hidden
                  />
                </div>
                <div style={{ flex: 2 }}>
                  <label className="admin-label">Ort</label>
                  <span
                    className="sk sk--input"
                    style={{ width: "100%" }}
                    aria-hidden
                  />
                </div>
              </div>
              <FieldSkeleton label="Land" last />
            </div>
          </div>

          {/* ── Sidebar (30%) ───────────────────────────────── */}
          <div className="pf-sidebar">
            {/* Anteckningar */}
            <div style={CARD}>
              <div className="ord-note-header">
                <span className="pf-card-title">Anteckningar</span>
                <span
                  className="sk"
                  style={{ width: 20, height: 20, borderRadius: 4 }}
                  aria-hidden
                />
              </div>
              <div style={{ marginTop: 8 }}>
                <span
                  className="sk sk--line-sm"
                  style={{ width: "70%" }}
                  aria-hidden
                />
              </div>
            </div>

            {/* Organisering (Taggar) */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Organisering</span>
              </div>
              <label
                className="admin-label"
                style={{ display: "block", marginBottom: 4 }}
              >
                Taggar
              </label>
              <span
                className="sk sk--input"
                style={{ display: "block" }}
                aria-hidden
              />
            </div>

            {/* Betalningsvillkor */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 8 }}>
                <span className="pf-card-title">Betalningsvillkor</span>
              </div>
              <span
                className="sk sk--input"
                style={{ display: "block" }}
                aria-hidden
              />
            </div>

            {/* Skatt */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 7 }}>
                <span className="pf-card-title">Skatt</span>
              </div>
              <span
                className="sk sk--input"
                style={{ display: "block" }}
                aria-hidden
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldSkeleton({ label, last }: { label: string; last?: boolean }) {
  return (
    <div className="pf-field" style={last ? { marginBottom: 0 } : undefined}>
      <label className="admin-label">{label}</label>
      <span
        className="sk sk--input"
        style={{ width: "100%", display: "block" }}
        aria-hidden
      />
    </div>
  );
}
