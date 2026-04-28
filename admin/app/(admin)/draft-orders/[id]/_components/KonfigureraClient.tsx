"use client";

import { useCallback, useState, type CSSProperties } from "react";
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
import { PublishBarUI } from "@/app/(admin)/_components/PublishBar/PublishBar";

import { LineItemsCard } from "./LineItemsCard";
import { PaymentCard } from "./PaymentCard";
import { PaymentTermsCard } from "./PaymentTermsCard";
import { StatusCard } from "./StatusCard";
import { CustomerCard } from "./CustomerCard";
import { DiscountCard } from "./DiscountCard";
import { NotesCard } from "./NotesCard";
import { TagsCard } from "./TagsCard";
import { HoldsCard } from "./HoldsCard";
import { CustomerCardEditable } from "./CustomerCardEditable";
import { NotesCardEditable } from "./NotesCardEditable";
import { TagsCardEditable } from "./TagsCardEditable";
import { ExpiresAtCardEditable } from "./ExpiresAtCardEditable";
import { DiscountCardEditable } from "./DiscountCardEditable";
import { PricesFrozenBanner } from "./PricesFrozenBanner";
import {
  updateDraftMetaAction,
  updateDraftCustomerAction,
} from "../actions";

// EDITABLE_STATUSES är private i service-modulerna (update-meta.ts +
// update-customer.ts). Duplicerad här som UI-advisory copy; service är
// authoritative gate. Hålls i sync med service-konstanterna.
const EDITABLE_STATUSES: DraftOrderStatus[] = [
  "OPEN",
  "PENDING_APPROVAL",
  "APPROVED",
];

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

  const editable = EDITABLE_STATUSES.includes(draft.status);
  const isLocked = draft.pricesFrozenAt !== null;

  // Card state (initialised from draft prop, reset on discard / refresh)
  const [customerState, setCustomerState] = useState<{
    guestAccountId: string | null;
  }>({ guestAccountId: draft.guestAccountId });
  const [metaState, setMetaState] = useState({
    internalNote: draft.internalNote ?? "",
    customerNote: draft.customerNote ?? "",
    tags: draft.tags,
    expiresAt: draft.expiresAt,
  });

  const [dirty, setDirty] = useState({
    customer: false,
    meta: false,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleCustomerChange = useCallback(
    (next: { guestAccountId: string | null }) => {
      setCustomerState(next);
      setDirty((prev) => ({ ...prev, customer: true }));
    },
    [],
  );

  const handleNotesChange = useCallback(
    (next: { internalNote: string; customerNote: string }) => {
      setMetaState((prev) => ({ ...prev, ...next }));
      setDirty((prev) => ({ ...prev, meta: true }));
    },
    [],
  );

  const handleTagsChange = useCallback((tags: string[]) => {
    setMetaState((prev) => ({ ...prev, tags }));
    setDirty((prev) => ({ ...prev, meta: true }));
  }, []);

  const handleExpiresAtChange = useCallback((expiresAt: Date) => {
    setMetaState((prev) => ({ ...prev, expiresAt }));
    setDirty((prev) => ({ ...prev, meta: true }));
  }, []);

  // Sequential save (Q1) with stop-at-first-failure (Q8).
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);

    if (dirty.customer) {
      const result = await updateDraftCustomerAction({
        draftId: draft.id,
        guestAccountId: customerState.guestAccountId,
      });
      if (!result.ok) {
        setSaveError(result.error);
        setIsSaving(false);
        return;
      }
      setDirty((prev) => ({ ...prev, customer: false }));
    }

    if (dirty.meta) {
      const result = await updateDraftMetaAction({
        draftId: draft.id,
        internalNote: metaState.internalNote,
        customerNote: metaState.customerNote,
        tags: metaState.tags,
        expiresAt: metaState.expiresAt,
      });
      if (!result.ok) {
        setSaveError(result.error);
        setIsSaving(false);
        return;
      }
      setDirty((prev) => ({ ...prev, meta: false }));
    }

    setIsSaving(false);
    setSavedAt(true);
    setTimeout(() => setSavedAt(false), 1500);
    router.refresh();
  }, [dirty, customerState, metaState, draft.id, router]);

  const handleDiscard = useCallback(() => {
    setIsDiscarding(true);
    setCustomerState({ guestAccountId: draft.guestAccountId });
    setMetaState({
      internalNote: draft.internalNote ?? "",
      customerNote: draft.customerNote ?? "",
      tags: draft.tags,
      expiresAt: draft.expiresAt,
    });
    setDirty({ customer: false, meta: false });
    setSaveError(null);
    setIsDiscarding(false);
  }, [draft]);

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

        {isLocked && <PricesFrozenBanner />}

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

            {editable ? (
              <CustomerCardEditable
                draft={draft}
                customer={customer}
                value={customerState}
                onChange={handleCustomerChange}
              />
            ) : (
              <CustomerCard draft={draft} customer={customer} />
            )}

            {editable && !isLocked ? (
              <DiscountCardEditable
                draftId={draft.id}
                appliedCode={draft.appliedDiscountCode}
                appliedAmount={draft.appliedDiscountAmount}
                onUpdate={() => router.refresh()}
              />
            ) : (
              <DiscountCard
                appliedDiscountCode={draft.appliedDiscountCode}
                appliedDiscountAmount={draft.appliedDiscountAmount}
                appliedDiscountType={draft.appliedDiscountType}
              />
            )}

            {editable ? (
              <NotesCardEditable
                value={{
                  internalNote: metaState.internalNote,
                  customerNote: metaState.customerNote,
                }}
                onChange={handleNotesChange}
              />
            ) : (
              <NotesCard
                internalNote={draft.internalNote}
                customerNote={draft.customerNote}
              />
            )}

            {editable ? (
              <TagsCardEditable
                value={metaState.tags}
                onChange={handleTagsChange}
              />
            ) : (
              <TagsCard tags={draft.tags} />
            )}

            {editable && (
              <ExpiresAtCardEditable
                value={metaState.expiresAt}
                onChange={handleExpiresAtChange}
              />
            )}

            <HoldsCard
              reservations={reservations}
              lineItems={draft.lineItems}
            />
          </div>
        </div>
      </div>

      {editable && (
        <PublishBarUI
          hasUnsavedChanges={dirty.customer || dirty.meta}
          isPublishing={isSaving}
          isDiscarding={isDiscarding}
          isLingeringAfterPublish={savedAt}
          onPublish={handleSave}
          onDiscard={handleDiscard}
          error={saveError}
        />
      )}
    </div>
  );
}
