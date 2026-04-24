/**
 * Loading skeleton for /customers/companies — mirrors CompaniesClient
 * exactly: same filter-bar chips, same column headers, same cst-row
 * gridding, same pagination placement. Containers, borders and spacing
 * are real; only the text/icon content inside is replaced by .co-sk
 * shimmer blocks.
 */

import "../../customers.css";
import "../../../files/files.css";
import "../_components/companies.css";

const SKELETON_ROWS = 12;

export default function CompaniesLoading() {
  return (
    <div className="admin-page admin-page--no-preview customers-page">
      <div className="admin-editor">
        {/* Header — same layout as CompaniesPage */}
        <div className="admin-header">
          <h1
            className="admin-title"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span
              className="material-symbols-rounded"
              style={{ fontSize: 22 }}
            >
              domain
            </span>
            Företag
          </h1>
          <div className="admin-actions">
            <span
              className="sk sk--btn"
              style={{ width: 120 }}
              aria-hidden
            />
          </div>
        </div>

        <div className="admin-content">
          {/* Filter bar */}
          <div className="cst-filter-bar">
            {Array.from({ length: 4 }).map((_, i) => (
              <span
                key={`chip-${i}`}
                className="sk sk--chip"
                aria-hidden
              />
            ))}
            <div className="cst-filter-bar__actions">
              <div className="cst-search" style={{ width: 220 }}>
                <span className="sk sk--input" aria-hidden />
              </div>
            </div>
          </div>

          {/* Column headers — real classes, text left as-is so the
              skeleton has the same height + border as the real header. */}
          <div className="cst-column-headers">
            <span className="cst-col cst-col--name">Namn</span>
            <span className="cst-col cst-col--marketing">Huvudkontakt</span>
            <span className="cst-col cst-col--orders">Platser</span>
            <span className="cst-col cst-col--location">Skapad</span>
            <span className="cst-col cst-col--spent">Status</span>
          </div>

          {/* Rows */}
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <div
              key={`row-${i}`}
              className="cst-row"
              style={{ cursor: "default" }}
              aria-hidden
            >
              <div className="cst-col cst-col--name">
                <span
                  className="sk sk--line-md"
                  style={{ width: "72%" }}
                />
              </div>
              <div className="cst-col cst-col--marketing">
                <span
                  className="sk sk--line-sm"
                  style={{ width: "80%" }}
                />
              </div>
              <div className="cst-col cst-col--orders">
                <span
                  className="sk sk--line-sm"
                  style={{ width: 60 }}
                />
              </div>
              <div className="cst-col cst-col--location">
                <span
                  className="sk sk--line-sm"
                  style={{ width: 92 }}
                />
              </div>
              <div className="cst-col cst-col--spent">
                <span className="sk sk--badge" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
