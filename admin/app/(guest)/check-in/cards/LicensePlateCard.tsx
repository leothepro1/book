"use client";

import { useEffect, useState } from "react";
import type { CheckinCardComponentProps } from "@/app/_lib/checkin-cards/types";
import { registerCardComponent } from "./registry";
import { ErrorSlide } from "./ErrorSlide";

function LicensePlateCard({ value, onChange, onValidChange, disabled, optional, showError }: CheckinCardComponentProps) {
  const [plate, setPlate] = useState<string>((value as string) || "");

  const isEmpty = plate.trim().length === 0;
  const isTooShort = !isEmpty && plate.trim().length < 2;
  const isValid = plate.trim().length >= 2;

  useEffect(() => {
    onValidChange(isValid);
  }, [isValid, onValidChange]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPlate(e.target.value);
    onChange(e.target.value);
  }

  const errorMessage = isEmpty
    ? "Ange ditt registreringsnummer"
    : isTooShort
      ? "Registreringsnumret verkar för kort"
      : null;

  const hasError = !!showError && !isValid;

  return (
    <div className="checkin-card">
      <div className="checkin-card__label-row">
        <span className="checkin-card__label">Registreringsnummer</span>
        {optional && <span className="checkin-card__optional">Valfritt</span>}
      </div>
      <div className="checkin-card__body">
        <input
          className={`checkin-card__input${hasError ? " checkin-card__input--error" : ""}`}
          type="text"
          value={plate}
          onChange={handleChange}
          placeholder=""
          autoComplete="off"
          disabled={disabled}
          style={{ fontWeight: 400 }}
        />
        <ErrorSlide
          message={errorMessage ?? ""}
          visible={hasError && !!errorMessage}
        />
      </div>
    </div>
  );
}

registerCardComponent("licensePlate", LicensePlateCard);
export default LicensePlateCard;
