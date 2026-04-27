"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import "../../products/_components/product-form.css";
import "../../gift-cards/gift-cards.css";
import "./new-draft-order.css";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { LineItemsCard } from "./_components/LineItemsCard";
import { SaveBar } from "./_components/SaveBar";
import { CustomerCard } from "./_components/CustomerCard";
import { CustomerPickerModal } from "./_components/CustomerPickerModal";
import { DiscountCard } from "./_components/DiscountCard";
import { PricingSummaryCard } from "./_components/PricingSummaryCard";
import type { LocalLineItem } from "./_components/types";
import type {
  CustomerSearchResult,
  PreviewResult,
} from "@/app/_lib/draft-orders";
import {
  createDraftWithLinesAction,
  previewDraftTotalsAction,
} from "./actions";

export function NewDraftOrderClient() {
  const router = useRouter();
  const [lines, setLines] = useState<LocalLineItem[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictingLineTempIds, setConflictingLineTempIds] = useState<
    string[]
  >([]);
  const [isSaving, startSaveTransition] = useTransition();
  const [customer, setCustomer] = useState<CustomerSearchResult | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [appliedDiscountCode, setAppliedDiscountCode] = useState<string | null>(
    null,
  );
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  // Stable serialization of the line payload — referential equality on `lines`
  // would re-fire the effect on every state update; we only want to re-fetch
  // when the payload actually changes.
  const linesKey = lines
    .map(
      (l) =>
        `${l.accommodation.id}|${l.fromDate.getTime()}|${l.toDate.getTime()}|${l.guestCount}`,
    )
    .join(",");

  // Live preview: 500ms debounced fetch with stale-response guard.
  // customer is intentionally NOT in deps — PreviewInput has no customerId
  // field today; preview totals are independent of who the buyer is.
  useEffect(() => {
    if (lines.length === 0) {
      setPreview(null);
      setIsPreviewing(false);
      setPreviewError(null);
      return;
    }
    const reqId = ++requestIdRef.current;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsPreviewing(true);
      setPreviewError(null);
      try {
        const result = await previewDraftTotalsAction({
          lines: lines.map((l) => ({
            accommodationId: l.accommodation.id,
            fromDate: l.fromDate,
            toDate: l.toDate,
            guestCount: l.guestCount,
          })),
          discountCode: appliedDiscountCode ?? undefined,
        });
        if (!cancelled && reqId === requestIdRef.current) {
          setPreview(result);
          setIsPreviewing(false);
        }
      } catch (err) {
        if (!cancelled && reqId === requestIdRef.current) {
          setPreviewError(
            err instanceof Error ? err.message : "Kunde inte beräkna totaler",
          );
          setIsPreviewing(false);
        }
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // linesKey captures the relevant subset of `lines`; ESLint cannot see that
    // the dep is sufficient and would force re-fires on every reference change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey, appliedDiscountCode]);

  // Discount-error visibility: only when (a) we have lines, (b) preview has
  // returned, and (c) service explicitly set discountError. discountApplicable
  // alone is overloaded (also false for empty/cross-tenant results).
  const showDiscountError =
    lines.length > 0 &&
    preview !== null &&
    !preview.discountApplicable &&
    typeof preview.discountError === "string";
  const discountErrorForCard = showDiscountError
    ? (preview?.discountError ?? null)
    : null;
  const discountIsApplicable = !showDiscountError;

  const canSave =
    lines.length > 0 &&
    lines.every((l) => l.availability?.available === true) &&
    lines.every((l) => l.fromDate < l.toDate) &&
    !isSaving;

  const handleSave = () => {
    setSaveError(null);
    setConflictingLineTempIds([]);
    startSaveTransition(async () => {
      const serviceLines = lines.map((l) => ({
        accommodationId: l.accommodation.id,
        fromDate: l.fromDate,
        toDate: l.toDate,
        guestCount: l.guestCount,
      }));

      const result = await createDraftWithLinesAction({ lines: serviceLines });

      if (result.ok) {
        router.push(`/draft-orders/${result.draft.id}/konfigurera`);
      } else {
        setSaveError(result.error);
        if (result.conflictingLineIndices) {
          const tempIds = result.conflictingLineIndices
            .map((idx) => lines[idx]?.tempId)
            .filter((id): id is string => id !== undefined);
          setConflictingLineTempIds(tempIds);
        }
      }
    });
  };

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
            <span style={{ marginLeft: 3 }}>Ny utkastorder</span>
          </h1>
        </div>

        {saveError && <div className="pf-error-banner">{saveError}</div>}

        <div className="pf-body">
          <div className="pf-main">
            <LineItemsCard
              lines={lines}
              setLines={setLines}
              conflictingLineTempIds={conflictingLineTempIds}
            />
          </div>
          <div className="pf-sidebar">
            <CustomerCard
              customer={customer}
              onChangeClick={() => setPickerOpen(true)}
              onClear={() => setCustomer(null)}
            />
            <DiscountCard
              appliedCode={appliedDiscountCode}
              onApply={(code) => setAppliedDiscountCode(code)}
              onRemove={() => setAppliedDiscountCode(null)}
              discountAmount={preview?.discountAmount ?? null}
              discountError={discountErrorForCard}
              isApplicable={discountIsApplicable}
            />
            <PricingSummaryCard
              preview={preview}
              isLoading={isPreviewing}
              hasLines={lines.length > 0}
              error={previewError}
            />
          </div>
        </div>
      </div>

      {pickerOpen && (
        <CustomerPickerModal
          onClose={() => setPickerOpen(false)}
          onSelect={(c) => setCustomer(c)}
        />
      )}

      <SaveBar canSave={canSave} isSaving={isSaving} onSave={handleSave} />
    </div>
  );
}
