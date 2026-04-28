"use client";

import { type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type {
  DiscountValueType,
  DraftLineItem,
  DraftOrderStatus,
  DraftReservation,
  GuestAccount,
} from "@prisma/client";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { DraftBadge } from "@/app/(admin)/_components/draft-orders/DraftBadge";

import { LineItemsCard } from "./LineItemsCard";
import { PaymentCard } from "./PaymentCard";
import { PaymentTermsCard } from "./PaymentTermsCard";
import { StatusCard } from "./StatusCard";
import { CustomerCard } from "./CustomerCard";
import { DiscountCard } from "./DiscountCard";
import { NotesCard } from "./NotesCard";
import { TagsCard } from "./TagsCard";
import { HoldsCard } from "./HoldsCard";

type SerializableLineItem = Omit<DraftLineItem, "lineDiscountValue"> & {
  lineDiscountValue: number | null;
};

export type KonfigureraClientDraft = {
  id: string;
  displayNumber: string;
  status: DraftOrderStatus;
  createdAt: Date;
  expiresAt: Date;
  invoiceSentAt: Date | null;
  pricesFrozenAt: Date | null;
  guestAccountId: string | null;
  companyLocationId: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  appliedDiscountCode: string | null;
  appliedDiscountAmount: bigint | null;
  appliedDiscountType: DiscountValueType | null;
  internalNote: string | null;
  customerNote: string | null;
  tags: string[];
  subtotalCents: bigint;
  orderDiscountCents: bigint;
  shippingCents: bigint;
  totalTaxCents: bigint;
  totalCents: bigint;
  currency: string;
  lineItems: SerializableLineItem[];
};

export type KonfigureraPaymentTerms = {
  id: string;
  name: string | null;
  depositPercent: number | null;
  frozen: boolean;
};

interface KonfigureraClientProps {
  draft: KonfigureraClientDraft;
  reservations: DraftReservation[];
  customer: GuestAccount | null;
  stripePaymentIntent: { id: string; status: string } | null;
  prev: { id: string; displayNumber: string } | null;
  next: { id: string; displayNumber: string } | null;
  paymentTerms: KonfigureraPaymentTerms | null;
}

const NAV_BUTTON: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  border: "none",
  borderRadius: 6,
  background: "#E3E3E3",
  color: "var(--admin-text)",
  cursor: "pointer",
};

const NAV_BUTTON_DISABLED: CSSProperties = {
  ...NAV_BUTTON,
  opacity: 0.35,
  cursor: "not-allowed",
};

const NAV_GROUP: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  marginLeft: "auto",
};

export function KonfigureraClient({
  draft,
  reservations,
  customer,
  stripePaymentIntent,
  prev,
  next,
  paymentTerms,
}: KonfigureraClientProps) {
  const router = useRouter();

  return (
    <div className="admin-page admin-page--no-preview products-page">
      <div className="admin-editor">
        <div className="admin-header pf-header">
          <h1
            className="admin-title"
            style={{ display: "flex", alignItems: "center", gap: 0 }}
          >
            <button
              type="button"
              className="menus-breadcrumb__icon"
              onClick={() => router.push("/draft-orders")}
              aria-label="Tillbaka till utkastorders"
            >
              <span
                className="material-symbols-rounded"
                style={{ fontSize: 22 }}
              >
                receipt_long
              </span>
            </button>
            <EditorIcon
              name="chevron_right"
              size={16}
              style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }}
            />
            <span style={{ marginLeft: 3 }}>Draft {draft.displayNumber}</span>
            <span className="pf-header__actions" style={{ marginLeft: 8 }}>
              <DraftBadge status={draft.status} />
            </span>
          </h1>
          <div style={NAV_GROUP}>
            <button
              type="button"
              style={prev ? NAV_BUTTON : NAV_BUTTON_DISABLED}
              disabled={prev === null}
              onClick={() =>
                prev && router.push(`/draft-orders/${prev.id}/konfigurera`)
              }
              aria-label="Föregående utkast"
            >
              <EditorIcon name="expand_less" size={18} />
            </button>
            <button
              type="button"
              style={next ? NAV_BUTTON : NAV_BUTTON_DISABLED}
              disabled={next === null}
              onClick={() =>
                next && router.push(`/draft-orders/${next.id}/konfigurera`)
              }
              aria-label="Nästa utkast"
            >
              <EditorIcon name="expand_more" size={18} />
            </button>
          </div>
        </div>

        <div className="pf-body">
          <div className="pf-main">
            <LineItemsCard lines={draft.lineItems} />
            <PaymentCard draft={draft} />
            {paymentTerms !== null && (
              <PaymentTermsCard
                paymentTermsId={paymentTerms.id}
                name={paymentTerms.name}
                depositPercent={paymentTerms.depositPercent}
                frozen={paymentTerms.frozen}
              />
            )}
          </div>
          <div className="pf-sidebar">
            <StatusCard
              draft={draft}
              stripePaymentIntent={stripePaymentIntent}
            />
            <CustomerCard draft={draft} customer={customer} />
            <DiscountCard
              appliedDiscountCode={draft.appliedDiscountCode}
              appliedDiscountAmount={draft.appliedDiscountAmount}
              appliedDiscountType={draft.appliedDiscountType}
            />
            <NotesCard
              internalNote={draft.internalNote}
              customerNote={draft.customerNote}
            />
            <TagsCard tags={draft.tags} />
            <HoldsCard
              reservations={reservations}
              lineItems={draft.lineItems}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
