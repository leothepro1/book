"use client";

import { useState, type CSSProperties } from "react";
import type { GuestAccount } from "@prisma/client";
import { CustomerPickerModal } from "@/app/(admin)/draft-orders/new/_components/CustomerPickerModal";
import type { CustomerSearchResult } from "@/app/_lib/draft-orders";

const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

const ROW: CSSProperties = {
  fontSize: 13,
  color: "var(--admin-text)",
  marginTop: 6,
};

const LABEL: CSSProperties = {
  color: "var(--admin-text-muted)",
  marginRight: 6,
};

const ACTIONS_ROW: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 12,
};

const REMOVE_LINK: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  fontSize: 13,
  color: "var(--admin-danger, #8E0B21)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const EMPTY: CSSProperties = {
  fontSize: 13,
  color: "var(--admin-text-muted)",
  marginBottom: 8,
};

type CustomerCardEditableDraft = {
  guestAccountId: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

interface CustomerCardEditableProps {
  draft: CustomerCardEditableDraft;
  customer: GuestAccount | null;
  value: { guestAccountId: string | null };
  onChange: (next: { guestAccountId: string | null }) => void;
}

function joinName(first: string | null, last: string | null): string | null {
  const parts = [first, last].filter((p): p is string => !!p && p.length > 0);
  return parts.length > 0 ? parts.join(" ") : null;
}

export function CustomerCardEditable({
  draft,
  customer,
  value,
  onChange,
}: CustomerCardEditableProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // Holds the customer the user just picked, until the parent commits the
  // change and refreshes. Lets the card show the new name/email/phone
  // immediately rather than waiting for a server round-trip.
  const [pendingCustomer, setPendingCustomer] =
    useState<CustomerSearchResult | null>(null);

  const hasCustomer = value.guestAccountId !== null;

  // Display resolution: pending pick first (latest user action),
  // then snapshot fields on the draft, then the GuestAccount lookup,
  // then null (handled by empty-state).
  let name: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;

  if (pendingCustomer && value.guestAccountId === pendingCustomer.id) {
    name = pendingCustomer.name;
    email = pendingCustomer.email;
    phone = pendingCustomer.phone;
  } else if (value.guestAccountId !== null) {
    name =
      joinName(draft.contactFirstName, draft.contactLastName) ??
      (customer ? joinName(customer.firstName, customer.lastName) : null);
    email = draft.contactEmail ?? customer?.email ?? null;
    phone = draft.contactPhone ?? customer?.phone ?? null;
  }

  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <span className="pf-card-title">Kund</span>
      </div>

      {!hasCustomer ? (
        <>
          <p style={EMPTY}>Ingen kund kopplad.</p>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={() => setPickerOpen(true)}
          >
            + Lägg till kund
          </button>
        </>
      ) : (
        <>
          {name !== null && (
            <div style={{ ...ROW, fontWeight: 500, marginTop: 0 }}>{name}</div>
          )}
          {email !== null && (
            <div style={ROW}>
              <span style={LABEL}>E-post</span>
              {email}
            </div>
          )}
          {phone !== null && (
            <div style={ROW}>
              <span style={LABEL}>Telefon</span>
              {phone}
            </div>
          )}
          <div style={ACTIONS_ROW}>
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              onClick={() => setPickerOpen(true)}
            >
              Ändra
            </button>
            <button
              type="button"
              style={REMOVE_LINK}
              onClick={() => {
                setPendingCustomer(null);
                onChange({ guestAccountId: null });
              }}
            >
              Ta bort kund
            </button>
          </div>
        </>
      )}

      {pickerOpen && (
        <CustomerPickerModal
          onClose={() => setPickerOpen(false)}
          onSelect={(picked) => {
            setPendingCustomer(picked);
            onChange({ guestAccountId: picked.id });
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}
