"use client";

import { useEffect, useState } from "react";
import SignatureCanvas from "../SignatureCanvas";
import type { CheckinCardComponentProps } from "@/app/_lib/checkin-cards/types";
import { registerCardComponent } from "./registry";
import { ErrorSlide } from "./ErrorSlide";

function SignatureCard({ value, onChange, onValidChange, optional, showError }: CheckinCardComponentProps) {
  const [dataUrl, setDataUrl] = useState<string | null>((value as string) || null);
  const isValid = dataUrl !== null;

  useEffect(() => {
    onValidChange(isValid);
  }, [isValid, onValidChange]);

  function handleSignatureChange(url: string | null) {
    setDataUrl(url);
    onChange(url ?? undefined);
  }

  return (
    <div className="checkin-card">
      <div className="checkin-card__label-row">
        <span className="checkin-card__label">Signatur</span>
        {optional && <span className="checkin-card__optional">Valfritt</span>}
      </div>
      <div className="checkin-card__body">
        <SignatureCanvas onSignatureChange={handleSignatureChange} />
        <ErrorSlide
          message="Signatur krävs för att slutföra incheckningen"
          visible={!!showError && !isValid}
        />
      </div>
    </div>
  );
}

registerCardComponent("signature", SignatureCard);
export default SignatureCard;
