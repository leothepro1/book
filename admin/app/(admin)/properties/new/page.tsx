"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ProductForm from "../../products/_components/ProductForm";

const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "24px",
  boxShadow: "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
  cursor: "pointer",
  transition: "box-shadow 0.15s, border-color 0.15s",
  border: "2px solid transparent",
  flex: 1,
  minWidth: 200,
};

export default function NewPropertyPage() {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);

  if (showForm) {
    return <ProductForm basePath="/properties" />;
  }

  return (
    <div className="admin-page admin-page--no-preview products-page">
      <div className="admin-editor">
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "clamp(2rem, 5vw, 4rem) var(--space-6)" }}>
          <h1 style={{ fontSize: "var(--font-xl)", fontWeight: 600, marginBottom: "var(--space-6)", color: "var(--admin-text)" }}>
            Välj produkttyp
          </h1>
          <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
            {/* STANDARD product */}
            <div
              style={CARD}
              onClick={() => setShowForm(true)}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--admin-accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: 32, color: "var(--admin-text)", marginBottom: "var(--space-3)", display: "block" }}>
                inventory_2
              </span>
              <h3 style={{ fontSize: "var(--font-md)", fontWeight: 600, marginBottom: "var(--space-2)", color: "var(--admin-text)" }}>
                Produkt
              </h3>
              <p style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)", lineHeight: 1.5, margin: "0 0 var(--space-4)" }}>
                Skapa en produkt att sälja i din butik — frukostbuffé, cykeluthyrning, välkomstpaket.
              </p>
              <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--admin-accent)" }}>
                Välj →
              </span>
            </div>

            {/* PMS_ACCOMMODATION */}
            <div
              style={CARD}
              onClick={() => router.push("/properties#settings/integrations")}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-focus)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: 32, color: "var(--admin-text)", marginBottom: "var(--space-3)", display: "block" }}>
                hotel
              </span>
              <h3 style={{ fontSize: "var(--font-md)", fontWeight: 600, marginBottom: "var(--space-2)", color: "var(--admin-text)" }}>
                Boende
              </h3>
              <p style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)", lineHeight: 1.5, margin: "0 0 var(--space-4)" }}>
                Boenden importeras automatiskt från ditt PMS. Anslut eller synka under Integrationer.
              </p>
              <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--admin-text-secondary)" }}>
                Gå till import →
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
