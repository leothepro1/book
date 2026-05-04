"use client";

import { useEffect, useState } from "react";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { Toggle } from "@/app/(admin)/_components/Toggle";
import "./checkout.css";

type Props = {
  onSubTitleChange?: (title: string | null) => void;
};

/**
 * Kassa (checkout) — settings panel.
 *
 * UI shell only. None of the toggles are wired to persistence yet —
 * the underlying checkout flow can't honour these settings until each
 * one is plumbed through `app/api/checkout/*` and the storefront
 * checkout client. Local state only; hook into a server action when
 * the corresponding storage column is added (see GeneralContent /
 * CustomerAccountsContent for the optimistic-save reference pattern).
 */
export function CheckoutContent({ onSubTitleChange }: Props) {
  // ── Container 1: Kontaktmetod ───────────────────────────────
  const [contactMethod, setContactMethod] = useState<"email" | "phone-email">("email");
  const [requireLoginBeforeCheckout, setRequireLoginBeforeCheckout] = useState(false);

  // ── Container 2: Anpassning av kassan ───────────────────────
  const [allowSpecialRequests, setAllowSpecialRequests] = useState(true);
  const [showArrivalTime, setShowArrivalTime] = useState(false);
  const [showHoldCountdown, setShowHoldCountdown] = useState(true);

  // ── Container 3: Marknadsföring & samtycke ──────────────────
  const [allowNewsletterOptIn, setAllowNewsletterOptIn] = useState(true);
  const [newsletterPrechecked, setNewsletterPrechecked] = useState(false);
  const [requireTermsAcceptance, setRequireTermsAcceptance] = useState(true);

  useEffect(() => {
    onSubTitleChange?.(null);
  }, [onSubTitleChange]);

  return (
    <>
      {/* ═══ Container 1: Kontaktmetod ════════════════════════ */}
      <div>
        <div className="co-settings__label">Kontaktmetod</div>

        <div className="co-settings__list">
          <label className="co-settings__radio-row">
            <input
              type="radio"
              name="contact-method"
              value="email"
              checked={contactMethod === "email"}
              onChange={() => setContactMethod("email")}
              className="co-settings__radio"
            />
            <span className="co-settings__radio-label">E-postadress</span>
          </label>

          <div className="co-settings__divider" />

          <label className="co-settings__radio-row">
            <input
              type="radio"
              name="contact-method"
              value="phone-email"
              checked={contactMethod === "phone-email"}
              onChange={() => setContactMethod("phone-email")}
              className="co-settings__radio"
            />
            <span className="co-settings__radio-label">
              Telefonnummer och e-postadress
            </span>
          </label>

          <div className="co-settings__divider" />

          <label className="co-settings__check-row">
            <input
              type="checkbox"
              checked={requireLoginBeforeCheckout}
              onChange={(e) => setRequireLoginBeforeCheckout(e.target.checked)}
              className="co-settings__checkbox"
            />
            <span className="co-settings__check-text">
              <span className="co-settings__check-label">
                Kräv att kunder loggar in före kassan
              </span>
              <span className="co-settings__check-desc">
                Kunder kan endast använda e-post när inloggning krävs
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* ═══ Container 2: Anpassning av kassan ════════════════ */}
      <div>
        <div className="co-settings__label">Anpassning av kassan</div>

        <div className="co-settings__list">
          <div className="co-settings__row">
            <span className="co-settings__row-icon">
              <EditorIcon name="edit_note" size={20} />
            </span>
            <div className="co-settings__row-text">
              <div className="co-settings__row-title">Tillåt specialönskemål</div>
              <div className="co-settings__row-desc">
                Visa ett textfält där gästen kan skriva önskemål inför ankomst (allergier, preferenser, hänsyn).
              </div>
            </div>
            <span className="co-settings__row-control">
              <Toggle
                checked={allowSpecialRequests}
                onChange={setAllowSpecialRequests}
                ariaLabel="Tillåt specialönskemål"
              />
            </span>
          </div>

          <div className="co-settings__divider" />

          <div className="co-settings__row">
            <span className="co-settings__row-icon">
              <EditorIcon name="schedule" size={20} />
            </span>
            <div className="co-settings__row-text">
              <div className="co-settings__row-title">Visa ankomsttid</div>
              <div className="co-settings__row-desc">
                Låt gästen ange en planerad ankomsttid i kassan. Synkas till PMS.
              </div>
            </div>
            <span className="co-settings__row-control">
              <Toggle
                checked={showArrivalTime}
                onChange={setShowArrivalTime}
                ariaLabel="Visa ankomsttid"
              />
            </span>
          </div>

          <div className="co-settings__divider" />

          <div className="co-settings__row">
            <span className="co-settings__row-icon">
              <EditorIcon name="timer" size={20} />
            </span>
            <div className="co-settings__row-text">
              <div className="co-settings__row-title">Visa nedräkning</div>
              <div className="co-settings__row-desc">
                Visa hur länge bokningen är reserverad i kassan (15 minuter). Skapar urgency och kommunicerar tillgänglighetslås tydligt.
              </div>
            </div>
            <span className="co-settings__row-control">
              <Toggle
                checked={showHoldCountdown}
                onChange={setShowHoldCountdown}
                ariaLabel="Visa nedräkning"
              />
            </span>
          </div>
        </div>
      </div>

      {/* ═══ Container 3: Marknadsföring & samtycke ═══════════ */}
      <div>
        <div className="co-settings__label">Marknadsföring & samtycke</div>

        <div className="co-settings__list">
          <div className="co-settings__row">
            <span className="co-settings__row-icon">
              <EditorIcon name="subscriptions" size={20} />
            </span>
            <div className="co-settings__row-text">
              <div className="co-settings__row-title">Tillåt nyhetsbrevsanmälan</div>
              <div className="co-settings__row-desc">
                Visa en kryssruta för nyhetsbrev i kassan. Gäster som tackar ja synkas till din epostmarknadsföring.
              </div>
            </div>
            <span className="co-settings__row-control">
              <Toggle
                checked={allowNewsletterOptIn}
                onChange={setAllowNewsletterOptIn}
                ariaLabel="Tillåt nyhetsbrevsanmälan"
              />
            </span>
          </div>

          <div className="co-settings__divider" />

          <div className="co-settings__row">
            <span className="co-settings__row-icon">
              <EditorIcon name="done_all" size={20} />
            </span>
            <div className="co-settings__row-text">
              <div className="co-settings__row-title">Förvald opt-in</div>
              <div className="co-settings__row-desc">
                Förkryssa nyhetsbrevsrutan. Stäng av för att kräva aktivt samtycke (rekommenderas i EU).
              </div>
            </div>
            <span className="co-settings__row-control">
              <Toggle
                checked={newsletterPrechecked}
                onChange={setNewsletterPrechecked}
                disabled={!allowNewsletterOptIn}
                ariaLabel="Förvald opt-in"
              />
            </span>
          </div>

          <div className="co-settings__divider" />

          <div className="co-settings__row">
            <span className="co-settings__row-icon">
              <EditorIcon name="gavel" size={20} />
            </span>
            <div className="co-settings__row-text">
              <div className="co-settings__row-title">Kräv villkorsacceptans</div>
              <div className="co-settings__row-desc">
                Gästen måste aktivt acceptera bokningsvillkoren innan betalning kan slutföras.
              </div>
            </div>
            <span className="co-settings__row-control">
              <Toggle
                checked={requireTermsAcceptance}
                onChange={setRequireTermsAcceptance}
                ariaLabel="Kräv villkorsacceptans"
              />
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
