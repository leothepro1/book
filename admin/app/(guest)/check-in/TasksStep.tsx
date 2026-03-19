"use client";

import { useCallback, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { CheckinCardDefinition, CheckinCardData, CheckinCardId } from "@/app/_lib/checkin-cards/types";
import { getCardComponent } from "./cards/registry";
import "./cards";
import "./cards/checkin-cards.css";
import AppLoader from "../_components/AppLoader";

type Props = {
  /** Active cards in display order (resolved from tenant config). */
  activeCards: CheckinCardDefinition[];
  /** Terms URL for the tenant. */
  termsUrl: string;
  /** Tenant's configured check-in time (HH:MM). */
  checkInTime?: string;
  /** Submit all card data. */
  onSubmit: (data: CheckinCardData) => Promise<void>;
  /** Whether submission is in progress. */
  busy: boolean;
  /** Error message to display. */
  error: string | null;
};

export default function TasksStep({ activeCards, termsUrl, checkInTime, onSubmit, busy, error }: Props) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  // Card data: cardId → value
  const dataRef = useRef<Record<string, unknown>>({});

  // Card validity: cardId → boolean
  const [validity, setValidity] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const card of activeCards) init[card.id] = false;
    return init;
  });

  const handleChange = useCallback((cardId: CheckinCardId, value: unknown) => {
    dataRef.current[cardId] = value;
  }, []);

  const handleValidChange = useCallback((cardId: CheckinCardId, valid: boolean) => {
    setValidity((prev) => {
      if (prev[cardId] === valid) return prev;
      return { ...prev, [cardId]: valid };
    });
  }, []);

  // Only required (non-optional) cards must be valid
  const requiredCards = activeCards.filter((c) => !c.optional);
  const allRequiredValid = requiredCards.every((c) => validity[c.id]);
  const allValid = activeCards.every((c) => c.optional || validity[c.id]);

  async function handleSubmit() {
    if (busy) return;

    // Trigger error display if required fields are missing
    if (!allValid || !termsAccepted) {
      setShowErrors(true);
      return;
    }

    const cardData: CheckinCardData = {};
    const d = dataRef.current;

    if (d.signature !== undefined) cardData.signature = d.signature as string;
    if (d.phone !== undefined) cardData.phone = d.phone as string;
    if (d.guestCount !== undefined) cardData.guestCount = d.guestCount as number;
    if (d.licensePlate !== undefined) cardData.licensePlate = d.licensePlate as string;
    if (d.purposeOfStay !== undefined) cardData.purposeOfStay = d.purposeOfStay as string;
    if (d.idVerification !== undefined) cardData.idVerification = d.idVerification as string;
    if (d.estimatedArrival !== undefined) cardData.estimatedArrival = d.estimatedArrival as string;

    await onSubmit(cardData);
  }

  return (
    <>
      <div className="sektion73-card__header">
        <div>
          <h1 className="sektion73-title">Uppgifter</h1>
          <p className="sektion73-muted">Fyll i uppgifterna nedan för att slutföra din incheckning.</p>
        </div>
      </div>

      <div className="tasks-step__cards">
        {activeCards.map((card) => {
          const Component = getCardComponent(card.id);
          if (!Component) return null;

          const extraProps = card.id === "estimatedArrival" ? { checkInTime } : {};
          // Only show errors for required cards (optional cards skip validation)
          const shouldShowError = showErrors && !card.optional;

          return (
            <Component
              key={card.id}
              value={dataRef.current[card.id]}
              onChange={(v) => handleChange(card.id, v)}
              onValidChange={(v) => handleValidChange(card.id, v)}
              disabled={busy}
              optional={card.optional}
              showError={shouldShowError}
              {...extraProps}
            />
          );
        })}
      </div>

      {error && (
        <div className="sektion73-alert" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}

      <div className="sektion73-cta" style={{ marginTop: 24 }}>
        {termsUrl && (
          <label
            className="tasks-step__terms"
            onClick={() => setTermsAccepted(!termsAccepted)}
          >
            <div className={`tasks-step__checkbox${termsAccepted ? " tasks-step__checkbox--checked" : ""}`}>
              {termsAccepted && <Check size={16} color="#fff" strokeWidth={3} />}
            </div>
            <span className="tasks-step__terms-text">
              Jag godkänner boendets{" "}
              <a
                href={termsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="tasks-step__terms-link"
                onClick={(e) => e.stopPropagation()}
              >
                vistelsevillkor
              </a>
            </span>
          </label>
        )}

        <button
          type="button"
          className="sektion73-btn sektion73-btn--primary"
          disabled={busy}
          onClick={handleSubmit}
          aria-busy={busy ? "true" : "false"}
        >
          {busy ? <AppLoader size={24} ariaLabel="Loading" /> : "Slutför incheckning"}
        </button>
      </div>
    </>
  );
}
