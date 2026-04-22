"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { Toggle } from "@/app/(admin)/_components/Toggle";
import { getGuestPortalUrl } from "@/app/(admin)/_lib/tenant/getGuestPortalUrl";
import {
  getCustomerAccountsSettings,
  updateCustomerAccountsSettings,
} from "./actions";
import "./customer-accounts.css";

type Props = {
  onSubTitleChange?: (title: string | null) => void;
};

/**
 * Kundkonton (Customer accounts) — settings panel.
 *
 * Container 1: "Inloggningslänkar" — single toggle row.
 * Container 2: "Kundkonton" — four stacked inner rows:
 *     1. URL display (dns icon) + description
 *     2. Disabled input showing `{portalUrl}/account`
 *     3. Självbetjäningsavbokningar (event_busy + toggle)
 *     4. Inställningar (design_services + CTA → /editor/login)
 *
 * Persistence for the two toggles (showLoginLinks and
 * selfServiceCancellations) is NOT wired yet — local state only. Hook
 * into a server action when the storage columns are added. Keep the
 * loading/saving pattern used by GeneralContent as a reference.
 */
export function CustomerAccountsContent({ onSubTitleChange }: Props) {
  // Start undefined so the toggle renders disabled-ish until DB value
  // arrives — prevents a misleading "off" flash for tenants whose stored
  // value is true.
  const [showLoginLinks, setShowLoginLinks] = useState<boolean | null>(null);
  const [selfServiceCancellations, setSelfServiceCancellations] =
    useState(false);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);

  useEffect(() => {
    onSubTitleChange?.(null);

    let cancelled = false;
    void Promise.all([
      getCustomerAccountsSettings(),
      getGuestPortalUrl(),
    ]).then(([settings, url]) => {
      if (cancelled) return;
      if (settings) setShowLoginLinks(settings.showLoginLinks);
      setPortalUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [onSubTitleChange]);

  // Optimistic update + persist. On server error, revert the UI and
  // surface the message so the merchant sees the failure (basic alert
  // for Phase 1; Phase 4 swaps in a toast).
  const handleShowLoginLinksChange = useCallback(async (next: boolean) => {
    const previous = showLoginLinks;
    setShowLoginLinks(next);
    const result = await updateCustomerAccountsSettings({
      showLoginLinks: next,
    });
    if (!result.ok) {
      setShowLoginLinks(previous);
      alert(`Kunde inte spara inställningen: ${result.error}`);
    }
  }, [showLoginLinks]);

  // Display format: always show a clean https:// URL pointing at /account.
  // While the portal slug resolves, show the path only — avoids a
  // visible "jump" from an empty input to a populated one.
  const accountUrl = portalUrl ? `${portalUrl}/account` : "/account";

  return (
    <>
      {/* ═══ Container 1: Inloggningslänkar ═══════════════════ */}
      <div>
        <div className="ca-settings__label">Inloggningslänkar</div>

        <div className="ca-settings__list">
          <div className="ca-settings__row">
            <span className="ca-settings__row-icon">
              <EditorIcon name="login" size={20} />
            </span>
            <div className="ca-settings__row-text">
              <div className="ca-settings__row-title">
                Visa inloggningslänkar
              </div>
              <div className="ca-settings__row-desc">
                Visa inloggningslänkar i webbshopens sidhuvud och i kassan
              </div>
            </div>
            <span className="ca-settings__row-control">
              <Toggle
                checked={showLoginLinks ?? false}
                onChange={handleShowLoginLinksChange}
                disabled={showLoginLinks === null}
                ariaLabel="Visa inloggningslänkar"
              />
            </span>
          </div>
        </div>
      </div>

      {/* ═══ Container 2: Kundkonton ══════════════════════════ */}
      <div>
        <div className="ca-settings__label">Kundkonton</div>

        <div className="ca-settings__list">
          {/* Row 1 — Självbetjäningsavbokningar + toggle */}
          <div className="ca-settings__row">
            <span className="ca-settings__row-icon">
              <EditorIcon name="event_busy" size={20} />
            </span>
            <div className="ca-settings__row-text">
              <div className="ca-settings__row-title">
                Självbetjäningsavbokningar
              </div>
              <div className="ca-settings__row-desc">
                Tillåt kunder att begära och hantera returer.
              </div>
            </div>
            <span className="ca-settings__row-control">
              <Toggle
                checked={selfServiceCancellations}
                onChange={setSelfServiceCancellations}
                ariaLabel="Självbetjäningsavbokningar"
              />
            </span>
          </div>

          <div className="ca-settings__divider" />

          {/* Row 2 — Inställningar + CTA to editor login page */}
          <div className="ca-settings__row">
            <span className="ca-settings__row-icon">
              <EditorIcon name="design_services" size={20} />
            </span>
            <div className="ca-settings__row-text">
              <div className="ca-settings__row-title">Inställningar</div>
              <div className="ca-settings__row-desc">
                Konfigurera appar, varumärkeshantering och funktioner för
                kassan och kundkonton
              </div>
            </div>
            <span className="ca-settings__row-control">
              <Link href="/editor/login" className="settings-btn--outline">
                Anpassa
              </Link>
            </span>
          </div>

          <div className="ca-settings__divider" />

          {/* Row 3 — URL: header on top, disabled input below (one row) */}
          <div className="ca-settings__row ca-settings__row--stacked">
            <div className="ca-settings__row-head">
              <span className="ca-settings__row-icon">
                <EditorIcon name="dns" size={20} />
              </span>
              <div className="ca-settings__row-text">
                <div className="ca-settings__row-title">URL</div>
                <div className="ca-settings__row-desc">
                  Använd denna URL överallt där du vill att kunder ska komma
                  åt kundkonton
                </div>
              </div>
            </div>
            <input
              type="text"
              value={accountUrl}
              disabled
              readOnly
              aria-label="URL till kundkonton"
              className="ca-settings__url-input"
            />
          </div>
        </div>
      </div>
    </>
  );
}
