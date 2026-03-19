"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { PreviewProvider, usePreview } from "@/app/(admin)/_components/GuestPreview";
import { getActiveCheckinCards } from "@/app/_lib/pages/config";
import { getCardComponent } from "@/app/(guest)/check-in/cards/registry";
import "@/app/(guest)/check-in/cards";
import "@/app/(guest)/check-in/cards/checkin-cards.css";
import "@/app/(guest)/check-in/checkin.css";
import { themeToStyleAttr } from "@/app/(guest)/_lib/theme/applyTheme";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import type { CheckinCardId } from "@/app/_lib/checkin-cards/types";

export default function DevTestClient({ initialConfig }: { initialConfig: TenantConfig }) {
  return (
    <PreviewProvider initialConfig={initialConfig}>
      <DevTestInner />
    </PreviewProvider>
  );
}

function DevTestInner() {
  const { config } = usePreview();

  const activeCards = config ? getActiveCheckinCards(config) : [];
  const checkInTime = config?.property?.checkInTime || "15:00";

  // Resolve tenant theme CSS variables
  const themeVars = useMemo(() => {
    if (!config?.theme) return {} as React.CSSProperties;
    return themeToStyleAttr(config.theme);
  }, [config?.theme]);

  const dataRef = useRef<Record<string, unknown>>({});
  const [validity, setValidity] = useState<Record<string, boolean>>({});
  const [showErrors, setShowErrors] = useState(false);

  const handleChange = useCallback((cardId: CheckinCardId, value: unknown) => {
    dataRef.current[cardId] = value;
  }, []);

  const handleValidChange = useCallback((cardId: CheckinCardId, valid: boolean) => {
    setValidity((prev) => {
      if (prev[cardId] === valid) return prev;
      return { ...prev, [cardId]: valid };
    });
  }, []);

  return (
    <div
      style={{
        ...themeVars,
        background: "#fff",
        minHeight: "100vh",
        padding: "24px 0 120px",
      }}
    >
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 18px" }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{
            fontSize: 26,
            fontWeight: 700,
            color: "var(--text, #121212)",
            marginBottom: 6,
            fontFamily: "var(--font-heading, ui-sans-serif)",
          }}>
            Uppgifter
          </h1>
          <p style={{
            fontSize: 15,
            color: "var(--text, #121212)",
            opacity: 0.8,
            margin: 0,
            fontFamily: "var(--font-body, ui-sans-serif)",
            fontWeight: 400,
          }}>
            Fyll i uppgifterna nedan för att slutföra din incheckning
          </p>
        </div>

        <div>
          {activeCards.length === 0 && (
            <div style={{
              padding: "40px 0",
              textAlign: "center",
              color: "var(--text, #121212)",
              opacity: 0.4,
              fontSize: 14,
              fontFamily: "var(--font-body, ui-sans-serif)",
            }}>
              Inga formulärfält konfigurerade
            </div>
          )}
          {activeCards.map((def) => {
            const Component = getCardComponent(def.id);
            if (!Component) return null;

            return (
              <Component
                key={def.id}
                value={dataRef.current[def.id]}
                onChange={(v) => handleChange(def.id, v)}
                onValidChange={(v) => handleValidChange(def.id, v)}
                disabled={false}
                optional={def.optional}
                showError={showErrors && !def.optional}
                {...(def.id === "estimatedArrival" ? { checkInTime } : {})}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
