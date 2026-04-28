"use client";

import { type CSSProperties } from "react";
import Link from "next/link";
import type { DraftOrder, GuestAccount } from "@prisma/client";

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

const LINK: CSSProperties = {
  display: "inline-block",
  marginTop: 12,
  fontSize: 13,
  color: "var(--admin-link, #0070d2)",
  textDecoration: "none",
};

const EMPTY: CSSProperties = {
  fontSize: 13,
  color: "var(--admin-text-muted)",
};

type CustomerCardDraft = Pick<
  DraftOrder,
  | "guestAccountId"
  | "companyLocationId"
  | "contactFirstName"
  | "contactLastName"
  | "contactEmail"
  | "contactPhone"
>;

interface CustomerCardProps {
  draft: CustomerCardDraft;
  customer: GuestAccount | null;
}

function joinName(first: string | null, last: string | null): string | null {
  const parts = [first, last].filter((p): p is string => !!p && p.length > 0);
  return parts.length > 0 ? parts.join(" ") : null;
}

export function CustomerCard({ draft, customer }: CustomerCardProps) {
  const hasGuest = draft.guestAccountId !== null;
  const hasCompany = draft.companyLocationId !== null;
  const empty = !hasGuest && !hasCompany;

  const fallbackName = customer
    ? joinName(customer.firstName, customer.lastName)
    : null;
  const snapshotName = joinName(draft.contactFirstName, draft.contactLastName);
  const name = snapshotName ?? fallbackName;
  const email = draft.contactEmail ?? customer?.email ?? null;
  const phone = draft.contactPhone ?? customer?.phone ?? null;

  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <span className="pf-card-title">Kund</span>
      </div>

      {empty ? (
        <p style={EMPTY}>Ingen kund kopplad.</p>
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
          {hasCompany && draft.companyLocationId !== null && (
            <div style={ROW}>
              <span style={LABEL}>Företag</span>
              {draft.companyLocationId}
            </div>
          )}
          {hasGuest && draft.guestAccountId !== null && (
            <Link href={`/customers/${draft.guestAccountId}`} style={LINK}>
              Visa kund →
            </Link>
          )}
        </>
      )}
    </div>
  );
}
