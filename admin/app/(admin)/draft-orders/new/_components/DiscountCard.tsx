"use client";

import { useState, type CSSProperties } from "react";
import { formatSek } from "@/app/_lib/money/format";

const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

interface DiscountCardProps {
  appliedCode: string | null;
  onApply: (code: string) => void;
  onRemove: () => void;
  discountAmount: bigint | null;
  discountError: string | null;
  isApplicable: boolean;
}

export function DiscountCard({
  appliedCode,
  onApply,
  onRemove,
  discountAmount,
  discountError,
  isApplicable,
}: DiscountCardProps) {
  const [inputValue, setInputValue] = useState("");

  const handleApply = () => {
    const normalized = inputValue.trim().toUpperCase();
    if (normalized === "") return;
    onApply(normalized);
    setInputValue("");
  };

  const isInvalid = appliedCode !== null && !isApplicable;
  const showAmount =
    !isInvalid && discountAmount !== null && discountAmount > BigInt(0);

  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <span className="pf-card-title">Rabatt</span>
      </div>

      {appliedCode === null ? (
        <div className="ndr-discount-card__form">
          <input
            type="text"
            className="admin-input ndr-discount-card__input"
            placeholder="Rabattkod"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleApply();
              }
            }}
          />
          <button
            type="button"
            className="settings-btn settings-btn--connect"
            onClick={handleApply}
            disabled={inputValue.trim() === ""}
          >
            Tillämpa
          </button>
        </div>
      ) : (
        <>
          <div
            className={
              isInvalid
                ? "ndr-discount-pill ndr-discount-pill--invalid"
                : "ndr-discount-pill"
            }
          >
            <span className="ndr-discount-pill__code">{appliedCode}</span>
            {showAmount && discountAmount !== null ? (
              <span className="ndr-discount-pill__amount">
                −{formatSek(discountAmount)}
              </span>
            ) : null}
            <button
              type="button"
              className="ndr-discount-pill__remove"
              onClick={onRemove}
              aria-label="Ta bort rabatt"
            >
              ×
            </button>
          </div>
          {isInvalid && discountError ? (
            <div className="ndr-discount-error" role="alert">
              {discountError}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
