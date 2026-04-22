/**
 * Webbshop → Preferenser
 * ══════════════════════
 *
 * Merchant-facing SEO preferences for the `/` route. Lives under the
 * Webshop sales-channel nav (Shopify pattern: Online Store →
 * Preferences) — NOT under Settings. Settings is for business/account
 * configuration; Preferences is presentation-configuration.
 *
 * Layout reuses the codebase's shared admin-page scaffold
 * (`admin-page admin-page--no-preview` → `admin-editor` →
 * `admin-header` + `admin-content`) so the page is visually
 * indistinguishable from Customers / Orders / Products — same
 * header bar, same white-card container surface inside.
 *
 * Individual form sections inside `PreferencesContent` reuse the
 * `pf-body` / `pf-main` / card pattern from the product/category
 * forms. No new CSS files introduced.
 */

import "../../_components/admin-page.css";
import "../../products/_components/product-form.css";

import { PreferencesContent } from "./PreferencesContent";

export default function PreferencesPage() {
  return (
    <div className="admin-page admin-page--no-preview">
      <div className="admin-editor">
        <div className="admin-header">
          <h1
            className="admin-title"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span
              className="material-symbols-rounded"
              style={{ fontSize: 22 }}
            >
              tune
            </span>
            Preferenser
          </h1>
        </div>
        <div className="admin-content">
          <PreferencesContent />
        </div>
      </div>
    </div>
  );
}
