"use client";

import {
  useCallback,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import type { DraftLineItem } from "@prisma/client";
import { formatSek } from "@/app/_lib/money/format";
import { formatDateRange } from "@/app/_lib/search/dates";
import {
  updateDraftLineItemAction,
  removeDraftLineItemAction,
} from "../actions";

export type LineRowEditableLine = Pick<
  DraftLineItem,
  | "id"
  | "lineType"
  | "title"
  | "checkInDate"
  | "checkOutDate"
  | "quantity"
  | "unitPriceCents"
  | "totalCents"
>;

interface LineRowEditableProps {
  line: LineRowEditableLine;
  draftId: string;
  onUpdate: () => void;
}

const TD: CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid var(--admin-border)",
  color: "var(--admin-text)",
  verticalAlign: "top",
};

const TD_RIGHT: CSSProperties = { ...TD, textAlign: "right" };

const NUMBER_INPUT: CSSProperties = {
  width: 70,
  padding: "4px 6px",
  border: "1px solid var(--admin-border)",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "inherit",
  textAlign: "right",
  background: "#fff",
  color: "var(--admin-text)",
};

const REMOVE_BUTTON: CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 13,
  color: "var(--admin-danger, #8E0B21)",
  cursor: "pointer",
  fontFamily: "inherit",
  padding: "4px 8px",
};

const PENDING_ROW: CSSProperties = {
  opacity: 0.5,
  pointerEvents: "none",
};

const ERROR_TEXT: CSSProperties = {
  fontSize: 12,
  color: "var(--admin-danger, #8E0B21)",
  padding: "6px 8px",
  display: "block",
};

function formatLineDates(line: LineRowEditableLine): string {
  if (line.checkInDate && line.checkOutDate) {
    return formatDateRange(line.checkInDate, line.checkOutDate);
  }
  return "—";
}

export function LineRowEditable({
  line,
  draftId,
  onUpdate,
}: LineRowEditableProps) {
  const originalQty = line.quantity;
  const originalPriceCents = line.unitPriceCents;

  const [editedQty, setEditedQty] = useState<number>(originalQty);
  // Display price as kronor (decimal) for the user; store kronor cents as bigint.
  const [editedPriceKr, setEditedPriceKr] = useState<string>(
    (Number(originalPriceCents) / 100).toString(),
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustom = line.lineType === "CUSTOM";
  const isPending = isUpdating || isRemoving;
  const qtyMax = line.lineType === "ACCOMMODATION" ? 99 : 9999;

  const commitQty = useCallback(async () => {
    if (!Number.isFinite(editedQty) || editedQty < 1) {
      setEditedQty(originalQty);
      return;
    }
    if (editedQty === originalQty) return;
    setIsUpdating(true);
    setError(null);
    const result = await updateDraftLineItemAction({
      draftId,
      lineItemId: line.id,
      patch: { lineType: line.lineType, quantity: editedQty },
    });
    setIsUpdating(false);
    if (result.ok) {
      onUpdate();
    } else {
      setError(result.error);
      setEditedQty(originalQty);
    }
  }, [editedQty, originalQty, draftId, line.id, line.lineType, onUpdate]);

  const commitPrice = useCallback(async () => {
    if (!isCustom) return;
    const parsed = Number.parseFloat(editedPriceKr);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setEditedPriceKr((Number(originalPriceCents) / 100).toString());
      return;
    }
    const nextCents = BigInt(Math.round(parsed * 100));
    if (nextCents === originalPriceCents) return;
    setIsUpdating(true);
    setError(null);
    const result = await updateDraftLineItemAction({
      draftId,
      lineItemId: line.id,
      patch: { lineType: "CUSTOM", unitPriceCents: nextCents },
    });
    setIsUpdating(false);
    if (result.ok) {
      onUpdate();
    } else {
      setError(result.error);
      setEditedPriceKr((Number(originalPriceCents) / 100).toString());
    }
  }, [
    isCustom,
    editedPriceKr,
    originalPriceCents,
    draftId,
    line.id,
    onUpdate,
  ]);

  const handleQtyKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void commitQty();
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setEditedQty(originalQty);
        e.currentTarget.blur();
      }
    },
    [commitQty, originalQty],
  );

  const handlePriceKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void commitPrice();
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setEditedPriceKr((Number(originalPriceCents) / 100).toString());
        e.currentTarget.blur();
      }
    },
    [commitPrice, originalPriceCents],
  );

  const handleRemove = useCallback(async () => {
    setIsRemoving(true);
    setError(null);
    const result = await removeDraftLineItemAction({
      draftId,
      lineItemId: line.id,
    });
    if (result.ok) {
      onUpdate();
      // Row will unmount on parent re-render; no need to flip isRemoving.
    } else {
      setError(result.error);
      setIsRemoving(false);
    }
  }, [draftId, line.id, onUpdate]);

  return (
    <>
      <tr style={isPending ? PENDING_ROW : undefined}>
        <td style={TD}>{line.title}</td>
        <td style={TD}>{formatLineDates(line)}</td>
        <td style={TD_RIGHT}>
          <input
            type="number"
            min={1}
            max={qtyMax}
            value={editedQty}
            onChange={(e) => setEditedQty(Number(e.target.value))}
            onBlur={() => {
              void commitQty();
            }}
            onKeyDown={handleQtyKeyDown}
            disabled={isPending}
            aria-label={`Antal för ${line.title}`}
            style={NUMBER_INPUT}
          />
        </td>
        <td style={TD_RIGHT}>
          {isCustom ? (
            <input
              type="number"
              min={0}
              step="0.01"
              value={editedPriceKr}
              onChange={(e) => setEditedPriceKr(e.target.value)}
              onBlur={() => {
                void commitPrice();
              }}
              onKeyDown={handlePriceKeyDown}
              disabled={isPending}
              aria-label={`À-pris för ${line.title}`}
              style={NUMBER_INPUT}
            />
          ) : (
            formatSek(line.unitPriceCents)
          )}
        </td>
        <td style={TD_RIGHT}>{formatSek(line.totalCents)}</td>
        <td style={TD_RIGHT}>
          <button
            type="button"
            onClick={() => {
              void handleRemove();
            }}
            disabled={isPending}
            aria-label={`Ta bort ${line.title}`}
            style={REMOVE_BUTTON}
          >
            Ta bort
          </button>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={6} style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <span role="alert" style={ERROR_TEXT}>
              {error}
            </span>
          </td>
        </tr>
      )}
    </>
  );
}
