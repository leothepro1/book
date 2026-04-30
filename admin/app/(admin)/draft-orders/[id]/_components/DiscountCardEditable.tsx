"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { DiscountCard as NewDiscountCard } from "@/app/(admin)/draft-orders/new/_components/DiscountCard";
import {
  applyDraftDiscountCodeAction,
  removeDraftDiscountCodeAction,
} from "../actions";

interface DiscountCardEditableProps {
  draftId: string;
  appliedCode: string | null;
  appliedAmount: bigint | null;
  onUpdate: () => void;
}

const WRAPPER: CSSProperties = {
  position: "relative",
};

const OVERLAY: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(255,255,255,0.5)",
  pointerEvents: "all",
  cursor: "wait",
  borderRadius: "0.75rem",
};

/**
 * Edit-mode discount card for /konfigurera. Wraps /new DiscountCard and
 * wires apply/remove to the server-action layer.
 *
 * Discount changes commit immediately (Q9) — there is no dirty-tracking
 * here. On success the parent re-fetches via onUpdate (typically
 * router.refresh()).
 *
 * isApplicable=true: konfigurera-mode trustar server som authoritative gate.
 * Denna card renderas bara när editable && draft.status === "OPEN".
 * (Phase D will refine to also account for active checkout session.)
 *
 * Multi-click race-mitigering: lokalt isApplying-state styr overlay-element,
 * INTE prop till /new DiscountCard (den har ingen sådan prop).
 */
export function DiscountCardEditable({
  draftId,
  appliedCode,
  appliedAmount,
  onUpdate,
}: DiscountCardEditableProps) {
  const [error, setError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const handleApply = useCallback(
    async (code: string) => {
      setIsApplying(true);
      setError(null);
      const result = await applyDraftDiscountCodeAction({ draftId, code });
      setIsApplying(false);
      if (result.ok) {
        onUpdate();
      } else {
        setError(result.error);
      }
    },
    [draftId, onUpdate],
  );

  const handleRemove = useCallback(async () => {
    setIsApplying(true);
    setError(null);
    const result = await removeDraftDiscountCodeAction({ draftId });
    setIsApplying(false);
    if (result.ok) {
      onUpdate();
    } else {
      setError(result.error);
    }
  }, [draftId, onUpdate]);

  return (
    <div style={WRAPPER}>
      <NewDiscountCard
        appliedCode={appliedCode}
        discountAmount={appliedAmount}
        discountError={error}
        isApplicable={true}
        onApply={handleApply}
        onRemove={handleRemove}
      />
      {isApplying && (
        <div
          style={OVERLAY}
          aria-busy="true"
          aria-label="Sparar rabatt"
        />
      )}
    </div>
  );
}
