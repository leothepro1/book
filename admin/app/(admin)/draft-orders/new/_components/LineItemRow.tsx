"use client";

import type { CSSProperties } from "react";
import type { LocalLineItem } from "./types";
import { formatDateRange } from "@/app/_lib/search/dates";
import { BUCKET_STYLES } from "@/app/_lib/orders/badge";

type Props = {
  line: LocalLineItem;
  hasConflict: boolean;
  onRemove: () => void;
};

const PROBLEM_BADGE_STYLE: CSSProperties = {
  ...BUCKET_STYLES.PROBLEM,
  borderRadius: 8,
  padding: "2px 8px",
  fontSize: 12,
  fontWeight: 500,
  display: "inline-block",
};

export function LineItemRow({ line, hasConflict, onRemove }: Props) {
  const showUnavailable =
    !line.isCheckingAvailability && line.availability?.available === false;
  const showConflict = hasConflict;
  const guestSuffix = line.guestCount === 1 ? "gäst" : "gäster";

  return (
    <div
      className={`ndr-line-row${showUnavailable || showConflict ? " ndr-line-row--problem" : ""}`}
    >
      <div className="ndr-line-row__main">
        <div className="ndr-line-row__title">{line.accommodation.name}</div>
        <div className="ndr-line-row__meta">
          {formatDateRange(line.fromDate, line.toDate)} · {line.guestCount}{" "}
          {guestSuffix}
        </div>

        {line.isCheckingAvailability && (
          <div className="ndr-line-row__status">
            Kontrollerar tillgänglighet…
          </div>
        )}

        {showUnavailable && (
          <span className="ndr-line-row__badge" style={PROBLEM_BADGE_STYLE}>
            Inte tillgängligt
          </span>
        )}

        {showConflict && !showUnavailable && (
          <span className="ndr-line-row__badge" style={PROBLEM_BADGE_STYLE}>
            Konflikt
          </span>
        )}

        {showUnavailable && line.availability?.reason && (
          <div className="ndr-line-row__reason">{line.availability.reason}</div>
        )}
      </div>

      <button
        type="button"
        className="admin-btn admin-btn--ghost"
        onClick={onRemove}
        aria-label="Ta bort"
      >
        Ta bort
      </button>
    </div>
  );
}
