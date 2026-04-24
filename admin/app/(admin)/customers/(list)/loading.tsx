/**
 * Loading skeleton for /customers — mirrors CustomersClient exactly:
 * search input + sort button filter bar, column headers (with select-
 * checkbox placeholder), then .cst-row rows. Borders, flex widths and
 * paddings are real; only the dynamic text/badge content shimmers.
 *
 * Scoped inside a (list) route group so /new and /[id] are not covered
 * by this skeleton.
 */

import "../customers.css";
import "../../files/files.css";

const SKELETON_ROWS = 12;

export default function CustomersLoading() {
  return (
    <div className="admin-page admin-page--no-preview customers-page">
      <div className="admin-editor">
        {/* Header — real layout, "Skapa kund" button is a shimmer */}
        <div className="admin-header">
          <h1
            className="admin-title"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span
              className="material-symbols-rounded"
              style={{ fontSize: 22 }}
            >
              group
            </span>
            Kunder
          </h1>
          <div className="admin-actions">
            <span
              className="sk sk--btn"
              style={{ width: 110 }}
              aria-hidden
            />
          </div>
        </div>

        <div className="admin-content">
          {/* Filter bar — search input on the left, sort button on the right */}
          <div className="cst-filter-bar">
            <div className="cst-search" style={{ flex: 1 }}>
              <span className="sk sk--input" aria-hidden />
            </div>
            <span
              className="sk"
              style={{ width: 36, height: 36, borderRadius: 8 }}
              aria-hidden
            />
          </div>

          {/* Column headers — real text so heights match the live page */}
          <div className="cst-column-headers">
            <span
              className="sk"
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                flexShrink: 0,
              }}
              aria-hidden
            />
            <span className="cst-col cst-col--name">Kundnamn</span>
            <span className="cst-col cst-col--marketing">
              E-postprenumeration
            </span>
            <span className="cst-col cst-col--location">Plats</span>
            <span className="cst-col cst-col--orders">Ordrar</span>
            <span className="cst-col cst-col--spent">Belopp spenderat</span>
          </div>

          {/* Rows */}
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <div
              key={`row-${i}`}
              className="cst-row"
              style={{ cursor: "default" }}
              aria-hidden
            >
              <span
                className="sk"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  flexShrink: 0,
                }}
              />
              <div className="cst-col cst-col--name">
                <span
                  className="sk sk--line-md"
                  style={{ width: "72%" }}
                />
              </div>
              <div className="cst-col cst-col--marketing">
                <span className="sk sk--badge" />
              </div>
              <div className="cst-col cst-col--location">
                <span
                  className="sk sk--line-sm"
                  style={{ width: "70%" }}
                />
              </div>
              <div className="cst-col cst-col--orders">
                <span
                  className="sk sk--line-sm"
                  style={{ width: 70 }}
                />
              </div>
              <div className="cst-col cst-col--spent">
                <span
                  className="sk sk--line-sm"
                  style={{ width: 80 }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
