"use client";

import { useEffect, useState } from "react";
import type { CheckinCardComponentProps } from "@/app/_lib/checkin-cards/types";
import { registerCardComponent } from "./registry";
import { ErrorSlide } from "./ErrorSlide";

// Basic ID/passport validation: alphanumeric, 5-20 chars
function validateId(val: string): string | null {
  const trimmed = val.trim();
  if (trimmed.length === 0) return "Ange ditt ID- eller passnummer";
  if (trimmed.length < 5) return "Numret verkar för kort — ange minst 5 tecken";
  if (!/^[a-zA-Z0-9\-\s]+$/.test(trimmed)) return "Numret får bara innehålla bokstäver, siffror, mellanslag och bindestreck";
  return null;
}

function IdVerificationCard({ value, onChange, onValidChange, disabled, optional, showError }: CheckinCardComponentProps) {
  const [idNumber, setIdNumber] = useState<string>((value as string) || "");

  const error = validateId(idNumber);
  const isValid = error === null;

  useEffect(() => {
    onValidChange(isValid);
  }, [isValid, onValidChange]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setIdNumber(e.target.value);
    onChange(e.target.value);
  }

  const hasError = !!showError && !isValid;

  return (
    <div className="checkin-card">
      <div className="checkin-card__label-row">
        <span className="checkin-card__label">Legitimation</span>
        {optional && <span className="checkin-card__optional">Valfritt</span>}
      </div>
      <div className="checkin-card__body">
        <input
          className={`checkin-card__input${hasError ? " checkin-card__input--error" : ""}`}
          type="text"
          value={idNumber}
          onChange={handleChange}
          placeholder="ID- eller passnummer"
          autoComplete="off"
          disabled={disabled}
        />
        <ErrorSlide
          message={error ?? ""}
          visible={hasError && !!error}
        />
      </div>
    </div>
  );
}

registerCardComponent("idVerification", IdVerificationCard);
export default IdVerificationCard;
