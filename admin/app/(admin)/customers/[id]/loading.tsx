/**
 * Loading skeleton for /customers/[id] — mirrors CustomerDetailClient:
 *   pf-header:    group icon + chevron + name + "Fler åtgärder" + prev/next
 *   cst-overview: Spenderat belopp, Bokningar, Kund sedan
 *   pf-main:      Senaste bokning-kort + Tidslinje (comment input + events)
 *   pf-sidebar:   Kund-kort, Taggar-kort, Anteckningar-kort
 *
 * Containers, overview chips, field labels and card titles render as-is
 * so the layout stays stable when CustomerDetailClient mounts.
 */

import { EditorIcon } from "@/app/_components/EditorIcon";
import "@/app/(admin)/products/_components/product-form.css";
import "@/app/(admin)/orders/orders.css";
import "../customers.css";

const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

export default function CustomerDetailLoading() {
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
                group
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
            <span
              className="sk sk--title"
              style={{ width: 200, marginLeft: 3 }}
              aria-hidden
            />
          </h1>
          <div
            className="ord-header-actions"
            style={{ display: "flex", gap: 8 }}
          >
            <span
              className="sk sk--btn"
              style={{ width: 130 }}
              aria-hidden
            />
            <span
              className="sk"
              style={{ width: 32, height: 30, borderRadius: 8 }}
              aria-hidden
            />
            <span
              className="sk"
              style={{ width: 32, height: 30, borderRadius: 8 }}
              aria-hidden
            />
          </div>
        </div>

        {/* Overview — 3 items */}
        <div className="cst-overview">
          <div className="cst-overview__inner">
            {["Spenderat belopp", "Bokningar", "Kund sedan"].map((label) => (
              <div key={label} className="cst-overview__item">
                <span className="cst-overview__label">{label}</span>
                <span
                  className="sk sk--line-lg"
                  style={{ width: "55%", marginTop: 4 }}
                  aria-hidden
                />
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="pf-body">
          {/* ── Main column ───────────────────────────────── */}
          <div className="pf-main">
            {/* Senaste bokning */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 12 }}>
                <span className="pf-card-title">Senaste bokning</span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span className="sk sk--avatar" aria-hidden />
                <div style={{ flex: 1 }}>
                  <span
                    className="sk sk--line-md"
                    style={{ width: "60%" }}
                    aria-hidden
                  />
                  <span
                    className="sk sk--line-sm"
                    style={{ width: "40%", marginTop: 6 }}
                    aria-hidden
                  />
                </div>
                <span
                  className="sk sk--badge"
                  style={{ width: 90 }}
                  aria-hidden
                />
              </div>
            </div>

            {/* Tidslinje (comment input + events) */}
            <div style={CARD}>
              {/* Comment input area */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  paddingBottom: 12,
                  borderBottom: "1px solid var(--admin-border)",
                }}
              >
                <span className="sk sk--avatar" aria-hidden />
                <div style={{ flex: 1 }}>
                  <span
                    className="sk sk--input"
                    style={{ display: "block" }}
                    aria-hidden
                  />
                </div>
              </div>
              {/* Timeline events */}
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={`tl-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "12px 0",
                    borderBottom:
                      i < 2 ? "1px solid var(--admin-border)" : "none",
                  }}
                  aria-hidden
                >
                  <span className="sk sk--avatar" />
                  <div style={{ flex: 1 }}>
                    <span
                      className="sk sk--line-md"
                      style={{ width: "75%" }}
                    />
                    <span
                      className="sk sk--line-sm"
                      style={{ width: "35%", marginTop: 6 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Sidebar ───────────────────────────────────── */}
          <div className="pf-sidebar">
            {/* Kund-kort */}
            <div style={CARD}>
              <div className="ord-sidebar-label">Kund</div>
              <span
                className="sk sk--line-md"
                style={{ width: "70%", marginTop: 4 }}
                aria-hidden
              />

              <div className="ord-sidebar-label" style={{ marginTop: 16 }}>
                Kontaktuppgifter
              </div>
              <span
                className="sk sk--line-sm"
                style={{ width: "85%", marginTop: 4 }}
                aria-hidden
              />
              <span
                className="sk sk--line-sm"
                style={{ width: "55%", marginTop: 6 }}
                aria-hidden
              />

              <div className="ord-sidebar-label" style={{ marginTop: 16 }}>
                Adress
              </div>
              <span
                className="sk sk--line-sm"
                style={{ width: "75%", marginTop: 4 }}
                aria-hidden
              />
              <span
                className="sk sk--line-sm"
                style={{ width: "55%", marginTop: 6 }}
                aria-hidden
              />
              <span
                className="sk sk--line-sm"
                style={{ width: "35%", marginTop: 6 }}
                aria-hidden
              />

              <div className="ord-sidebar-label" style={{ marginTop: 16 }}>
                E-postmarknadsföring
              </div>
              <span
                className="sk sk--badge"
                style={{ marginTop: 4 }}
                aria-hidden
              />
            </div>

            {/* Taggar-kort */}
            <div style={CARD}>
              <label
                className="mi-card__field-label"
                style={{ marginBottom: 6, display: "block" }}
              >
                Taggar
              </label>
              <span
                className="sk sk--input"
                style={{ display: "block" }}
                aria-hidden
              />
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 8,
                }}
                aria-hidden
              >
                {[72, 56, 88].map((w, i) => (
                  <span
                    key={`tag-${i}`}
                    className="sk sk--pill"
                    style={{ width: w }}
                  />
                ))}
              </div>
            </div>

            {/* Anteckningar-kort */}
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
                  style={{ width: "92%" }}
                  aria-hidden
                />
                <span
                  className="sk sk--line-sm"
                  style={{ width: "68%", marginTop: 6 }}
                  aria-hidden
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
