"use client";

import { Fragment, useEffect, useState } from "react";
import {
  Radio,
  Checkbox,
  Menu,
  Button,
  Input,
} from "@/app/(admin)/_components/ui";
import "./checkout.css";

// ── Marknadsföring placement options ────────────────────────
const MARKETING_PLACEMENT_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "checkout-only", label: "Endast i kassan" },
  { id: "login-only", label: "Endast i inloggning" },
  { id: "checkout-and-login", label: "Kassa och inloggning" },
  { id: "hidden", label: "Visa inte" },
];

// ── Kundinformation rows ────────────────────────────────────
// Each row owns its own option list. First option in each row is
// the default. The id strings are arbitrary internal identifiers —
// the storefront checkout will read these when persistence wires up.
type CustomerFieldRow = {
  key: string;
  title: string;
  options: Array<{ id: string; label: string }>;
};

const CUSTOMER_FIELD_ROWS: CustomerFieldRow[] = [
  {
    key: "fullName",
    title: "Fullständigt namn",
    options: [
      { id: "first-and-last", label: "Kräv för- och efternamn" },
      { id: "last-only", label: "Kräv efternamn" },
    ],
  },
  {
    key: "company",
    title: "Företagsnamn",
    options: [
      { id: "exclude", label: "Inkludera inte" },
      { id: "optional", label: "Valfritt" },
      { id: "required", label: "Obligatorisk" },
    ],
  },
];

type Props = {
  onSubTitleChange?: (title: string | null) => void;
};

/**
 * Kassa (checkout) — settings panel.
 *
 * UI shell only. None of the controls are wired to persistence yet —
 * the underlying checkout flow can't honour these settings until each
 * one is plumbed through `app/api/checkout/*` and the storefront
 * checkout client. Local state only; hook into a server action when
 * the corresponding storage column is added (see GeneralContent /
 * CustomerAccountsContent for the optimistic-save reference pattern).
 */
export function CheckoutContent({ onSubTitleChange }: Props) {
  // ── Container 1: Kontaktmetod ───────────────────────────────
  const [contactMethod, setContactMethod] = useState<"email" | "phone-email">(
    "email",
  );
  const [requireLoginBeforeCheckout, setRequireLoginBeforeCheckout] =
    useState(false);

  // ── Container 2: Kundinformation ────────────────────────────
  // First option per row is the default — derived from the row
  // definitions so adding a row only requires updating the array.
  const [customerFields, setCustomerFields] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        CUSTOMER_FIELD_ROWS.map((row) => [row.key, row.options[0].id]),
      ),
  );

  // ── Container 3: Anmälan till marknadsföring ────────────────
  const [marketingPlacement, setMarketingPlacement] = useState(
    MARKETING_PLACEMENT_OPTIONS[0].id,
  );
  const [marketingLabel, setMarketingLabel] = useState(
    "Skicka mig nyheter och erbjudanden via e-post",
  );

  useEffect(() => {
    onSubTitleChange?.(null);
  }, [onSubTitleChange]);

  return (
    <>
      {/* ═══ Container 1: Kontaktmetod ════════════════════════ */}
      <div className="co-settings__group--contact">
        <div className="co-settings__label">Kontaktmetod</div>

        <div className="co-settings__list">
          <div className="co-settings__choice-row">
            <Radio
              checked={contactMethod === "email"}
              onChange={() => setContactMethod("email")}
              label="E-postadress"
            />
          </div>

          <div className="co-settings__divider" />

          <div className="co-settings__choice-row">
            <Radio
              checked={contactMethod === "phone-email"}
              onChange={() => setContactMethod("phone-email")}
              label="Telefonnummer och e-postadress"
            />
          </div>

          <div className="co-settings__divider" />

          <div className="co-settings__choice-row">
            <Checkbox
              checked={requireLoginBeforeCheckout}
              onChange={setRequireLoginBeforeCheckout}
              label={
                <span className="co-settings__check-text">
                  <span className="co-settings__check-label">
                    Kräv att kunder loggar in före kassan
                  </span>
                  <span className="co-settings__check-desc">
                    Kunder kan endast använda e-post när inloggning krävs
                  </span>
                </span>
              }
            />
          </div>
        </div>
      </div>

      {/* ═══ Container 2: Kundinformation ═════════════════════ */}
      <div className="co-settings__group--customer">
        <div className="co-settings__label">Kundinformation</div>

        <div className="co-settings__list">
          {CUSTOMER_FIELD_ROWS.map((row, i) => {
            const selectedId = customerFields[row.key];
            const selectedLabel =
              row.options.find((o) => o.id === selectedId)?.label ?? "";
            return (
              <Fragment key={row.key}>
                {i > 0 && <div className="co-settings__divider" />}
                <div className="co-settings__row">
                  <div className="co-settings__row-text">
                    <div className="co-settings__row-title">{row.title}</div>
                  </div>
                  <span className="co-settings__row-control">
                    <Menu
                      trigger={
                        <Button
                          variant="secondary"
                          trailingIcon="expand_more"
                        >
                          {selectedLabel}
                        </Button>
                      }
                    >
                      {row.options.map((opt) => (
                        <Menu.Item
                          key={opt.id}
                          onSelect={() =>
                            setCustomerFields((prev) => ({
                              ...prev,
                              [row.key]: opt.id,
                            }))
                          }
                        >
                          {opt.label}
                        </Menu.Item>
                      ))}
                    </Menu>
                  </span>
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* ═══ Container 3: Anmälan till marknadsföring ═════════ */}
      <div className="co-settings__group--marketing">
        <div className="co-settings__label">Anmälan till marknadsföring</div>
        <div className="co-settings__desc">
          Visa en kryssruta så att kunder kan anmäla sig till marknadsföring.
        </div>

        <div className="co-settings__list">
          <div className="co-settings__row co-settings__row--columns">
            <div className="co-settings__col">
              <label className="co-settings__field-label">
                Visa kryssrutan
              </label>
              <Menu
                trigger={
                  <Button
                    variant="secondary"
                    trailingIcon="expand_more"
                  >
                    {MARKETING_PLACEMENT_OPTIONS.find(
                      (o) => o.id === marketingPlacement,
                    )?.label ?? ""}
                  </Button>
                }
              >
                {MARKETING_PLACEMENT_OPTIONS.map((opt) => (
                  <Menu.Item
                    key={opt.id}
                    onSelect={() => setMarketingPlacement(opt.id)}
                  >
                    {opt.label}
                  </Menu.Item>
                ))}
              </Menu>
            </div>
            <div className="co-settings__col">
              <label className="co-settings__field-label">
                Texten på kryssrutan
              </label>
              <Input
                value={marketingLabel}
                onChange={setMarketingLabel}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
