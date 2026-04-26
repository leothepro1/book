"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import "../../products/_components/product-form.css";
import "../../gift-cards/gift-cards.css";
import "./new-draft-order.css";
import { LineItemsCard } from "./_components/LineItemsCard";
import { SaveBar } from "./_components/SaveBar";
import type { LocalLineItem } from "./_components/types";
import { createDraftWithLinesAction } from "./actions";

export function NewDraftOrderClient() {
  const router = useRouter();
  const [lines, setLines] = useState<LocalLineItem[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictingLineTempIds, setConflictingLineTempIds] = useState<
    string[]
  >([]);
  const [isSaving, startSaveTransition] = useTransition();

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
          <h1 className="admin-title">Ny utkastorder</h1>
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
          <div className="pf-sidebar">{/* 7.2b.2/.3 territory */}</div>
        </div>
      </div>

      <SaveBar canSave={canSave} isSaving={isSaving} onSave={handleSave} />
    </div>
  );
}
