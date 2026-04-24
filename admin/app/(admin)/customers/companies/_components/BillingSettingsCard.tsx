"use client";

/**
 * BillingSettingsCard — inline-editable card for Betalningsvillkor and
 * Skatt. Lives in the company detail page sidebar above Anteckningar.
 *
 * Both fields are persisted on the company's first CompanyLocation (the
 * same row that carries the billing address and org-number). Saves go
 * through `updateCompanyProfileAction` so a change here is transactional
 * and emits a COMPANY_UPDATED audit event just like edits from the meta
 * card's edit modal.
 *
 * Inline dirty-tracking pattern mirrors BillingAddressEditCard:
 *   - Initial values come from firstLocation
 *   - Spara/Avbryt only appear when the selection diverges from initial
 *   - On save: action → router.refresh() → server re-renders the card
 *     with the new initial values → dirty resets
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TaxSetting } from "@prisma/client";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { updateCompanyProfileAction } from "../actions";

const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

export interface PaymentTermOption {
  id: string;
  name: string;
}

interface Props {
  companyId: string;
  initial: {
    paymentTermsId: string;
    taxSetting: TaxSetting;
  };
  paymentTermsOptions: PaymentTermOption[];
}

function taxSettingLabel(setting: TaxSetting): string {
  if (setting === "COLLECT") return "Samla in moms";
  if (setting === "EXEMPT") return "Momsbefriad";
  return "Samla in om inte befriad";
}

export function BillingSettingsCard({
  companyId,
  initial,
  paymentTermsOptions,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [paymentTermsId, setPaymentTermsId] = useState(initial.paymentTermsId);
  const [taxSetting, setTaxSetting] = useState<TaxSetting>(initial.taxSetting);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const paymentRef = useRef<HTMLDivElement>(null);
  const taxRef = useRef<HTMLDivElement>(null);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync local state when the server re-renders with new initials
  // (e.g. after router.refresh() or concurrent admin edits).
  useEffect(() => {
    setPaymentTermsId(initial.paymentTermsId);
    setTaxSetting(initial.taxSetting);
  }, [initial.paymentTermsId, initial.taxSetting]);

  // Outside-click for the two dropdowns.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (paymentRef.current && !paymentRef.current.contains(e.target as Node)) {
        setPaymentOpen(false);
      }
      if (taxRef.current && !taxRef.current.contains(e.target as Node)) {
        setTaxOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  const dirty =
    paymentTermsId !== initial.paymentTermsId ||
    taxSetting !== initial.taxSetting;

  function discard() {
    setPaymentTermsId(initial.paymentTermsId);
    setTaxSetting(initial.taxSetting);
    setError(null);
  }

  function save() {
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const firstLocation: {
        paymentTermsId?: string | null;
        taxSetting?: TaxSetting;
      } = {};
      if (paymentTermsId !== initial.paymentTermsId) {
        firstLocation.paymentTermsId = paymentTermsId || null;
      }
      if (taxSetting !== initial.taxSetting) {
        firstLocation.taxSetting = taxSetting;
      }
      const result = await updateCompanyProfileAction({
        companyId,
        company: {},
        firstLocation,
      });
      setSaving(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedAt(true);
      setTimeout(() => setSavedAt(false), 1500);
      router.refresh();
    });
  }

  const selectedTerm = paymentTermsOptions.find((t) => t.id === paymentTermsId);

  return (
    <div style={CARD}>
      {/* Betalningsvillkor */}
      <div className="pf-card-header" style={{ marginBottom: 8 }}>
        <span className="pf-card-title">Betalningsvillkor</span>
      </div>
      <div className="admin-dropdown" ref={paymentRef}>
        <button
          type="button"
          className="admin-dropdown__trigger"
          onClick={() => setPaymentOpen((v) => !v)}
          disabled={saving}
        >
          <span
            className="admin-dropdown__text"
            style={{ textAlign: "left" }}
          >
            {selectedTerm?.name ?? "Inga villkor"}
          </span>
          <EditorIcon
            name="expand_more"
            size={18}
            className="admin-dropdown__chevron"
          />
        </button>
        {paymentOpen && (
          <div className="admin-dropdown__list">
            <button
              type="button"
              className={`admin-dropdown__item${paymentTermsId === "" ? " admin-dropdown__item--active" : ""}`}
              onClick={() => {
                setPaymentTermsId("");
                setPaymentOpen(false);
              }}
            >
              Inga villkor
              {paymentTermsId === "" && (
                <span className="admin-dropdown__check">✓</span>
              )}
            </button>
            {paymentTermsOptions.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`admin-dropdown__item${paymentTermsId === t.id ? " admin-dropdown__item--active" : ""}`}
                onClick={() => {
                  setPaymentTermsId(t.id);
                  setPaymentOpen(false);
                }}
              >
                {t.name}
                {paymentTermsId === t.id && (
                  <span className="admin-dropdown__check">✓</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Skatt */}
      <div className="pf-card-header" style={{ marginTop: 16, marginBottom: 8 }}>
        <span className="pf-card-title">Skatt</span>
      </div>
      <div className="admin-dropdown" ref={taxRef}>
        <button
          type="button"
          className="admin-dropdown__trigger"
          onClick={() => setTaxOpen((v) => !v)}
          disabled={saving}
        >
          <span
            className="admin-dropdown__text"
            style={{ textAlign: "left" }}
          >
            {taxSettingLabel(taxSetting)}
          </span>
          <EditorIcon
            name="expand_more"
            size={18}
            className="admin-dropdown__chevron"
          />
        </button>
        {taxOpen && (
          <div className="admin-dropdown__list">
            {(
              [
                ["COLLECT", "Samla in moms"],
                ["EXEMPT", "Momsbefriad"],
                ["COLLECT_UNLESS_EXEMPT", "Samla in om inte befriad"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`admin-dropdown__item${taxSetting === value ? " admin-dropdown__item--active" : ""}`}
                onClick={() => {
                  setTaxSetting(value);
                  setTaxOpen(false);
                }}
              >
                {label}
                {taxSetting === value && (
                  <span className="admin-dropdown__check">✓</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="pf-error-banner" style={{ margin: "12px 0 0 0" }}>
          <EditorIcon name="error" size={16} />
          <span>{error}</span>
          <button
            type="button"
            className="pf-error-banner__close"
            onClick={() => setError(null)}
          >
            <EditorIcon name="close" size={14} />
          </button>
        </div>
      )}

      {(dirty || savedAt) && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 12,
          }}
        >
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            style={{ padding: "5px 12px", borderRadius: 8 }}
            onClick={discard}
            disabled={saving}
          >
            Avbryt
          </button>
          <button
            type="button"
            className={`admin-btn admin-btn--accent${savedAt ? " admin-btn--done" : ""}`}
            style={{ padding: "5px 12px", borderRadius: 8 }}
            onClick={save}
            disabled={saving || !dirty}
          >
            {saving ? "Sparar…" : savedAt ? "Sparat ✓" : "Spara"}
          </button>
        </div>
      )}
    </div>
  );
}
