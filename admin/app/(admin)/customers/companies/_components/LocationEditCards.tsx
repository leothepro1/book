"use client";

/**
 * Location edit cards — collected in one file to keep FAS 5 visibility of
 * the pattern tight. Each exported card wraps EditableCard with a specific
 * save payload shape targeting `updateLocation` (or a narrower action for
 * store credit / catalog assignment). All cards are self-contained —
 * parents just drop them in and pass the current row.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  CompanyLocation,
  PaymentTermsType,
  StoreCreditReason,
} from "@prisma/client";
import {
  assignCatalogAction,
  issueStoreCreditAction,
  unassignCatalogAction,
  updateLocationAction,
} from "../actions";
import { EditableCard } from "./EditableCard";
import {
  AddressField,
  DateField,
  JsonField,
  MoneyInput,
  PercentInput,
  RadioGroup,
  SelectField,
  TextAreaField,
  TextField,
  ToggleField,
  type Address,
} from "./form-primitives";

function jsonToAddress(v: unknown): Address {
  if (!v || typeof v !== "object") return {};
  const o = v as Record<string, unknown>;
  return {
    name: typeof o.name === "string" ? o.name : undefined,
    line1: typeof o.line1 === "string" ? o.line1 : undefined,
    line2: typeof o.line2 === "string" ? o.line2 : undefined,
    postalCode: typeof o.postalCode === "string" ? o.postalCode : undefined,
    city: typeof o.city === "string" ? o.city : undefined,
    country: typeof o.country === "string" ? o.country : undefined,
  };
}

// ── Addresser ───────────────────────────────────────────────────

interface AddressDraft {
  name: string;
  billing: Address;
  sameAsBilling: boolean;
  shipping: Address;
}

export function AddressesEditCard({
  companyId,
  location,
}: {
  companyId: string;
  location: CompanyLocation;
}) {
  const initial: AddressDraft = {
    name: location.name,
    billing: jsonToAddress(location.billingAddress),
    sameAsBilling: location.shippingAddress === null,
    shipping: jsonToAddress(location.shippingAddress),
  };
  return (
    <EditableCard<AddressDraft>
      title="Adresser"
      initial={initial}
      onSave={async (d) =>
        updateLocationAction({
          companyId,
          locationId: location.id,
          patch: {
            name: d.name,
            billingAddress: { ...d.billing } as Record<string, unknown>,
            shippingAddress: d.sameAsBilling
              ? null
              : ({ ...d.shipping } as Record<string, unknown>),
          },
        })
      }
    >
      {({ draft, set }) => (
        <>
          <TextField
            label="Platsnamn"
            value={draft.name}
            onChange={(v) => set({ name: v })}
            required
          />
          <AddressField
            label="Faktureringsadress"
            value={draft.billing}
            onChange={(v) => set({ billing: v })}
            required
          />
          <ToggleField
            label="Samma leveransadress som fakturering"
            value={draft.sameAsBilling}
            onChange={(v) => set({ sameAsBilling: v })}
          />
          {!draft.sameAsBilling ? (
            <AddressField
              label="Leveransadress"
              value={draft.shipping}
              onChange={(v) => set({ shipping: v })}
            />
          ) : null}
        </>
      )}
    </EditableCard>
  );
}

// ── Metafields ──────────────────────────────────────────────────

interface MetafieldsDraft {
  metafields: unknown;
}

export function MetafieldsEditCard({
  companyId,
  location,
}: {
  companyId: string;
  location: CompanyLocation;
}) {
  const initial: MetafieldsDraft = { metafields: location.metafields ?? null };
  return (
    <EditableCard<MetafieldsDraft>
      title="Metafields"
      initial={initial}
      onSave={async (d) =>
        updateLocationAction({
          companyId,
          locationId: location.id,
          patch: { metafields: d.metafields },
        })
      }
    >
      {({ draft, set }) => (
        <JsonField
          label="Metafields (JSON-objekt)"
          value={draft.metafields}
          onChange={(v) => set({ metafields: v })}
          help="Ett JSON-objekt, t.ex. { &quot;contract&quot;: &quot;2026-001&quot; }. Lämna tomt för att rensa."
        />
      )}
    </EditableCard>
  );
}

// ── Betalningsvillkor ───────────────────────────────────────────

export function PaymentTermsEditCard({
  companyId,
  location,
  options,
}: {
  companyId: string;
  location: CompanyLocation;
  options: Array<{ id: string; name: string; type: PaymentTermsType }>;
}) {
  interface Draft {
    paymentTermsId: string;
  }
  const initial: Draft = { paymentTermsId: location.paymentTermsId ?? "" };
  return (
    <EditableCard<Draft>
      title="Betalningsvillkor"
      initial={initial}
      onSave={async (d) =>
        updateLocationAction({
          companyId,
          locationId: location.id,
          patch: { paymentTermsId: d.paymentTermsId || null },
        })
      }
    >
      {({ draft, set }) => (
        <SelectField
          label="Villkor"
          value={draft.paymentTermsId}
          onChange={(v) => set({ paymentTermsId: v })}
          options={[
            { value: "", label: "Inga" },
            ...options.map((o) => ({ value: o.id, label: o.name })),
          ]}
        />
      )}
    </EditableCard>
  );
}

// ── Deposit ─────────────────────────────────────────────────────

export function DepositEditCard({
  companyId,
  location,
}: {
  companyId: string;
  location: CompanyLocation;
}) {
  interface Draft {
    depositPercent: number;
  }
  const initial: Draft = { depositPercent: location.depositPercent };
  return (
    <EditableCard<Draft>
      title="Deposit"
      initial={initial}
      onSave={async (d) =>
        updateLocationAction({
          companyId,
          locationId: location.id,
          patch: { depositPercent: d.depositPercent },
        })
      }
    >
      {({ draft, set }) => (
        <PercentInput
          label="Procent som dras vid checkout"
          value={draft.depositPercent}
          onChange={(v) => set({ depositPercent: v })}
          help="0 = ingen deposit, 100 = full förskottsbetalning."
        />
      )}
    </EditableCard>
  );
}

// ── Kreditlimit ─────────────────────────────────────────────────

export function CreditLimitEditCard({
  companyId,
  location,
}: {
  companyId: string;
  location: CompanyLocation;
}) {
  interface Draft {
    creditLimitCents: bigint | null;
  }
  const initial: Draft = { creditLimitCents: location.creditLimitCents };
  return (
    <EditableCard<Draft>
      title="Kreditlimit"
      initial={initial}
      onSave={async (d) =>
        updateLocationAction({
          companyId,
          locationId: location.id,
          patch: { creditLimitCents: d.creditLimitCents },
        })
      }
    >
      {({ draft, set }) => (
        <>
          <ToggleField
            label="Ingen limit"
            value={draft.creditLimitCents === null}
            onChange={(v) =>
              set({
                creditLimitCents: v
                  ? null
                  : (draft.creditLimitCents ?? BigInt(0)),
              })
            }
          />
          {draft.creditLimitCents !== null ? (
            <MoneyInput
              label="Kreditlimit"
              value={draft.creditLimitCents}
              onChange={(v) => set({ creditLimitCents: v })}
              help="Hård gräns — order som skulle överskrida limiten blockeras vid checkout (FAS 6)."
            />
          ) : null}
        </>
      )}
    </EditableCard>
  );
}

// ── Checkout ────────────────────────────────────────────────────

export function CheckoutEditCard({
  companyId,
  location,
}: {
  companyId: string;
  location: CompanyLocation;
}) {
  interface Draft {
    checkoutMode: "AUTO_SUBMIT" | "DRAFT_FOR_REVIEW";
    allowOneTimeShippingAddress: boolean;
  }
  const initial: Draft = {
    checkoutMode: location.checkoutMode,
    allowOneTimeShippingAddress: location.allowOneTimeShippingAddress,
  };
  return (
    <EditableCard<Draft>
      title="Checkout"
      initial={initial}
      onSave={async (d) =>
        updateLocationAction({
          companyId,
          locationId: location.id,
          patch: {
            checkoutMode: d.checkoutMode,
            allowOneTimeShippingAddress: d.allowOneTimeShippingAddress,
          },
        })
      }
    >
      {({ draft, set }) => (
        <>
          <RadioGroup
            label="Checkout-läge"
            value={draft.checkoutMode}
            onChange={(v) => set({ checkoutMode: v })}
            options={[
              {
                value: "AUTO_SUBMIT",
                label: "Direktorder",
                description:
                  "Köpare slutför ordrar direkt utan manuellt godkännande.",
              },
              {
                value: "DRAFT_FOR_REVIEW",
                label: "Kräver godkännande",
                description:
                  "Ordrar hamnar som utkast för företagets administratör att godkänna.",
              },
            ]}
          />
          <ToggleField
            label="Tillåt engångsleveransadress vid checkout"
            value={draft.allowOneTimeShippingAddress}
            onChange={(v) => set({ allowOneTimeShippingAddress: v })}
          />
        </>
      )}
    </EditableCard>
  );
}

// ── Skatt ───────────────────────────────────────────────────────

export function TaxEditCard({
  companyId,
  location,
}: {
  companyId: string;
  location: CompanyLocation;
}) {
  interface Draft {
    taxId: string;
    taxSetting: "COLLECT" | "EXEMPT" | "COLLECT_UNLESS_EXEMPT";
    taxExemptions: string[];
  }
  const initial: Draft = {
    taxId: location.taxId ?? "",
    taxSetting: location.taxSetting,
    taxExemptions: [...(location.taxExemptions ?? [])],
  };
  return (
    <EditableCard<Draft>
      title="Skatt"
      initial={initial}
      onSave={async (d) =>
        updateLocationAction({
          companyId,
          locationId: location.id,
          patch: {
            taxId: d.taxId.trim() || null,
            taxSetting: d.taxSetting,
            taxExemptions: d.taxExemptions,
          },
        })
      }
    >
      {({ draft, set }) => (
        <>
          <TextField
            label="Organisations-/VAT-nummer"
            value={draft.taxId}
            onChange={(v) => set({ taxId: v })}
            help="Validering mot Skatteverket kommer i en senare version."
          />
          <SelectField
            label="Skatteinställning"
            value={draft.taxSetting}
            onChange={(v) => set({ taxSetting: v })}
            options={[
              { value: "COLLECT", label: "Samla in moms" },
              { value: "EXEMPT", label: "Momsbefriad" },
              {
                value: "COLLECT_UNLESS_EXEMPT",
                label: "Samla in om inte befriad",
              },
            ]}
          />
        </>
      )}
    </EditableCard>
  );
}

// ── Issue Store Credit ──────────────────────────────────────────

export function IssueStoreCreditForm({
  companyId,
  locationId,
}: {
  companyId: string;
  locationId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<bigint | null>(null);
  const [reason, setReason] = useState<StoreCreditReason>("ADMIN_ISSUE");
  const [note, setNote] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setAmount(null);
    setReason("ADMIN_ISSUE");
    setNote("");
    setExpiresAt("");
    setError(null);
  }

  function save() {
    if (amount === null || amount <= BigInt(0)) {
      setError("Beloppet måste vara större än 0");
      return;
    }
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const result = await issueStoreCreditAction({
        companyId,
        locationId,
        amountCents: amount.toString(),
        reason,
        note: note.trim() || null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button
          type="button"
          className="co-btn co-btn--primary"
          onClick={() => setOpen(true)}
        >
          + Utfärda store credit
        </button>
      </div>
    );
  }

  return (
    <div className="co-inline-form" role="region" aria-label="Utfärda store credit">
      <h3 className="co-card__title" style={{ marginTop: 0 }}>Utfärda store credit</h3>
      {error ? (
        <div className="co-card__error" role="alert">{error}</div>
      ) : null}
      <MoneyInput
        label="Belopp"
        value={amount}
        onChange={setAmount}
        help="Bara positiva värden. Negativa spend hanteras via orderflödet."
        allowNull
      />
      <SelectField
        label="Orsak"
        value={reason}
        onChange={(v) => setReason(v as StoreCreditReason)}
        options={[
          { value: "ADMIN_ISSUE", label: "Utfärdad av admin" },
          { value: "REFUND", label: "Återbetalning" },
          { value: "ADJUSTMENT", label: "Justering" },
        ]}
        help="ORDER_PAYMENT och EXPIRATION styrs av systemet och visas inte här."
      />
      <TextAreaField
        label="Anteckning"
        value={note}
        onChange={setNote}
        rows={3}
      />
      <DateField
        label="Utgångsdatum"
        value={expiresAt}
        onChange={setExpiresAt}
        help="Valfritt — kredit utan datum gäller tills den konsumeras eller återkallas."
      />
      <div className="co-inline-form__actions">
        <button
          type="button"
          className="co-btn co-btn--ghost"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={busy}
        >
          Avbryt
        </button>
        <button
          type="button"
          className="co-btn co-btn--primary"
          onClick={save}
          disabled={busy}
        >
          {busy ? "Utfärdar…" : "Utfärda"}
        </button>
      </div>
    </div>
  );
}

// ── Assign catalog ──────────────────────────────────────────────

export function AssignCatalogForm({
  companyId,
  locationId,
  catalogOptions,
}: {
  companyId: string;
  locationId: string;
  catalogOptions: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (catalogOptions.length === 0) {
    return (
      <p className="co-muted" style={{ marginBottom: 12 }}>
        Inga kataloger finns. Skapa en katalog innan du kan tilldela den.
      </p>
    );
  }

  function save() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const result = await assignCatalogAction({
        companyId,
        locationId,
        catalogId: selected,
      });
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        setTimeout(() => setError(null), 5000);
        return;
      }
      setSelected("");
      router.refresh();
    });
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-end",
        marginBottom: 12,
      }}
    >
      <div style={{ flex: 1 }}>
        <SelectField
          label="Tilldela katalog"
          value={selected}
          onChange={setSelected}
          options={[
            { value: "", label: "Välj katalog…" },
            ...catalogOptions.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        {error ? (
          <div className="co-field__error">{error}</div>
        ) : null}
      </div>
      <button
        type="button"
        className="co-btn co-btn--primary"
        onClick={save}
        disabled={busy || !selected}
        style={{ height: 36 }}
      >
        {busy ? "Tilldelar…" : "Tilldela"}
      </button>
    </div>
  );
}

export function UnassignCatalogButton({
  companyId,
  locationId,
  catalogId,
  catalogName,
}: {
  companyId: string;
  locationId: string;
  catalogId: string;
  catalogName: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  function onClick() {
    if (
      !confirm(
        `Ta bort tilldelningen av "${catalogName}" från denna plats? Priserna återställs till standard.`,
      )
    )
      return;
    setBusy(true);
    startTransition(async () => {
      const result = await unassignCatalogAction({
        companyId,
        locationId,
        catalogId,
      });
      setBusy(false);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <button
      type="button"
      className="co-btn co-btn--danger"
      onClick={onClick}
      disabled={busy}
    >
      {busy ? "…" : "Ta bort tilldelning"}
    </button>
  );
}
