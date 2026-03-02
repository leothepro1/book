"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import SignatureCanvas from "./SignatureCanvas";
import AppLoader from "../_components/AppLoader";

type Props = {
  termsUrl: string;
  onSubmit: (signatureDataUrl: string) => Promise<void>;
  busy: boolean;
  error: string | null;
};

export default function SignatureStep({ termsUrl, onSubmit, busy, error }: Props) {
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const canSubmit = signatureDataUrl !== null && termsAccepted && !busy;

  const handleSubmit = async () => {
    if (!canSubmit || !signatureDataUrl) return;
    await onSubmit(signatureDataUrl);
  };

  return (
    <>
      <div className="sektion73-card__header">
        <div>
          <h1 className="sektion73-title">Signera din incheckning</h1>
          <p className="sektion73-muted">Rita din signatur nedan för att fortsätta</p>
        </div>
      </div>

      <div style={{ marginTop: "20px" }}>
        <SignatureCanvas onSignatureChange={setSignatureDataUrl} />
      </div>

      {error && (
        <div className="sektion73-alert" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}

      <div className="sektion73-cta" style={{ marginTop: 24 }}>
        <label
          onClick={() => setTermsAccepted(!termsAccepted)}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            cursor: "pointer",
            userSelect: "none",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              width: "22px",
              height: "22px",
              flexShrink: 0,
              border: "2px solid #D7DADE",
              borderRadius: "6px",
              display: "grid",
              placeItems: "center",
              background: termsAccepted ? "#8b3dff" : "#fff",
              borderColor: termsAccepted ? "#8b3dff" : "#D7DADE",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {termsAccepted && <Check size={16} color="#fff" strokeWidth={3} />}
          </div>
          <span style={{ fontSize: "14px", lineHeight: "1.5", color: "var(--text)" }}>
            Jag godkänner boendets{" "}
            <a
              href={termsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#8b3dff",
                textDecoration: "underline",
                fontWeight: 600,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              vistelsevillkor
            </a>
          </span>
        </label>

        <button
          type="button"
          className="sektion73-btn sektion73-btn--primary"
          disabled={!canSubmit}
          onClick={handleSubmit}
          aria-busy={busy ? "true" : "false"}
        >
          {busy ? <AppLoader size={24} ariaLabel="Loading" /> : "Slutför incheckning"}
        </button>
      </div>
    </>
  );
}
