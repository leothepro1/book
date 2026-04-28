"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { AccommodationPickerModal } from "@/app/(admin)/draft-orders/new/_components/AccommodationPickerModal";
import type { AccommodationSearchResult } from "@/app/_lib/draft-orders";
import { addDraftLineItemAction } from "../actions";
import {
  LineRowEditable,
  type LineRowEditableLine,
} from "./LineRowEditable";

const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
  position: "relative",
};

const TABLE: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const TH: CSSProperties = {
  textAlign: "left",
  padding: "8px 8px",
  borderBottom: "1px solid var(--admin-border)",
  color: "var(--admin-text-muted)",
  fontWeight: 500,
};

const TH_RIGHT: CSSProperties = { ...TH, textAlign: "right" };

const ADD_BUTTON_ROW: CSSProperties = {
  marginTop: 12,
};

const EMPTY: CSSProperties = {
  fontSize: 13,
  color: "var(--admin-text-muted)",
};

const ERROR_TEXT: CSSProperties = {
  fontSize: 12,
  color: "var(--admin-danger, #8E0B21)",
  marginTop: 8,
  display: "block",
};

const OVERLAY: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(255,255,255,0.5)",
  pointerEvents: "all",
  cursor: "wait",
  borderRadius: "0.75rem",
};

interface LineItemsCardEditableProps {
  lines: LineRowEditableLine[];
  draftId: string;
  onUpdate: () => void;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function LineItemsCardEditable({
  lines,
  draftId,
  onUpdate,
}: LineItemsCardEditableProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const handleAddFromPicker = useCallback(
    async (
      acc: AccommodationSearchResult,
      fromDate: Date,
      toDate: Date,
      guestCount: number,
    ) => {
      setPickerOpen(false);
      setIsAdding(true);
      setAddError(null);
      const result = await addDraftLineItemAction({
        draftId,
        line: {
          lineType: "ACCOMMODATION",
          accommodationId: acc.id,
          checkInDate: toIsoDate(fromDate),
          checkOutDate: toIsoDate(toDate),
          guestCounts: { adults: guestCount, children: 0, infants: 0 },
          taxable: true,
        },
      });
      setIsAdding(false);
      if (result.ok) {
        onUpdate();
      } else {
        setAddError(result.error);
      }
    },
    [draftId, onUpdate],
  );

  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <span className="pf-card-title">Bokning</span>
      </div>

      {lines.length === 0 ? (
        <p style={EMPTY}>Inga rader.</p>
      ) : (
        <table style={TABLE}>
          <thead>
            <tr>
              <th style={TH}>Boende</th>
              <th style={TH}>Datum</th>
              <th style={TH_RIGHT}>Antal</th>
              <th style={TH_RIGHT}>À pris</th>
              <th style={TH_RIGHT}>Total</th>
              <th style={TH_RIGHT}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <LineRowEditable
                key={line.id}
                line={line}
                draftId={draftId}
                onUpdate={onUpdate}
              />
            ))}
          </tbody>
        </table>
      )}

      <div style={ADD_BUTTON_ROW}>
        <button
          type="button"
          className="admin-btn admin-btn--ghost"
          onClick={() => setPickerOpen(true)}
          disabled={isAdding}
        >
          + Lägg till boende
        </button>
      </div>

      {addError && (
        <span role="alert" style={ERROR_TEXT}>
          {addError}
        </span>
      )}

      {pickerOpen && (
        <AccommodationPickerModal
          onClose={() => setPickerOpen(false)}
          onAdd={handleAddFromPicker}
        />
      )}

      {isAdding && (
        <div style={OVERLAY} aria-busy="true" aria-label="Lägger till boende" />
      )}
    </div>
  );
}
