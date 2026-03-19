"use client";

import { useEffect, useRef, useState } from "react";
import type { CheckinCardComponentProps } from "@/app/_lib/checkin-cards/types";
import { registerCardComponent } from "./registry";

function GuestCountCard({ value, onChange, onValidChange, disabled, optional }: CheckinCardComponentProps) {
  const [count, setCount] = useState<number>((value as number) || 1);
  const didInit = useRef(false);

  // Always valid — stepper starts at 1, min is 1
  useEffect(() => {
    onValidChange(true);
  }, [onValidChange]);

  // Set default value on mount only
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    if (!value) onChange(1);
  }, [value, onChange]);

  function update(next: number) {
    if (next < 1 || next > 20 || disabled) return;
    setCount(next);
    onChange(next);
  }

  return (
    <div className="checkin-card">
      <div className="checkin-card__label-row">
        <span className="checkin-card__label">Antal gäster</span>
        {optional && <span className="checkin-card__optional">Valfritt</span>}
      </div>
      <div className="checkin-card__body">
        <div className="checkin-stepper">
          <button
            type="button"
            className="checkin-stepper__btn"
            disabled={count <= 1 || disabled}
            onClick={() => update(count - 1)}
            aria-label="Minska"
          >
            <span className="material-symbols-rounded" style={{ fontSize: 20 }}>remove</span>
          </button>
          <span className="checkin-stepper__value">{count}</span>
          <button
            type="button"
            className="checkin-stepper__btn"
            disabled={count >= 20 || disabled}
            onClick={() => update(count + 1)}
            aria-label="Öka"
          >
            <span className="material-symbols-rounded" style={{ fontSize: 20 }}>add</span>
          </button>
        </div>
      </div>
    </div>
  );
}

registerCardComponent("guestCount", GuestCountCard);
export default GuestCountCard;
