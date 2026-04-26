"use client";

import { useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { LineItemRow } from "./LineItemRow";
import { AccommodationPickerModal } from "./AccommodationPickerModal";
import type { LocalLineItem } from "./types";
import { generateTempId } from "./types";
import { checkAvailabilityAction } from "../actions";
import type { AccommodationSearchResult } from "@/app/_lib/draft-orders";

const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

type Props = {
  lines: LocalLineItem[];
  setLines: Dispatch<SetStateAction<LocalLineItem[]>>;
  conflictingLineTempIds: string[];
};

export function LineItemsCard({
  lines,
  setLines,
  conflictingLineTempIds,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleAddLine = async (
    accommodation: AccommodationSearchResult,
    fromDate: Date,
    toDate: Date,
    guestCount: number,
  ) => {
    const tempId = generateTempId();
    const newLine: LocalLineItem = {
      tempId,
      accommodation,
      fromDate,
      toDate,
      guestCount,
      isCheckingAvailability: true,
    };
    setLines((prev) => [...prev, newLine]);
    setPickerOpen(false);

    const result = await checkAvailabilityAction(
      accommodation.id,
      fromDate,
      toDate,
    );
    setLines((prev) =>
      prev.map((l) =>
        l.tempId === tempId
          ? { ...l, availability: result, isCheckingAvailability: false }
          : l,
      ),
    );
  };

  const handleRemoveLine = (tempId: string) => {
    setLines((prev) => prev.filter((l) => l.tempId !== tempId));
  };

  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <span className="pf-card-title">Boende</span>
      </div>

      {lines.length === 0 ? (
        <div className="ndr-empty">Inga boenden tillagda</div>
      ) : (
        <div className="ndr-line-list">
          {lines.map((line) => (
            <LineItemRow
              key={line.tempId}
              line={line}
              hasConflict={conflictingLineTempIds.includes(line.tempId)}
              onRemove={() => handleRemoveLine(line.tempId)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        className="admin-btn admin-btn--ghost"
        onClick={() => setPickerOpen(true)}
      >
        + Lägg till boende
      </button>

      {pickerOpen && (
        <AccommodationPickerModal
          onClose={() => setPickerOpen(false)}
          onAdd={handleAddLine}
        />
      )}
    </div>
  );
}
