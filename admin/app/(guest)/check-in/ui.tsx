"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLoader from "../_components/AppLoader";
import SuccessLoader from "../_components/SuccessLoader";
import SignatureStep from "./SignatureStep";
import SuccessView from "./SuccessView";
import type { CheckInLookupPayload, CheckInLookupResponse, CheckInCommitResponse } from "./actions";

type Step = "form" | "confirm" | "signature" | "success";

type Props = {
  onLookup: (payload: CheckInLookupPayload) => Promise<CheckInLookupResponse>;
  onCommit: (payload: { bookingId: string; signatureDataUrl: string; token?: string; next?: string }) => Promise<CheckInCommitResponse>;
};

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15 18l-6-6 6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, color: "#121212" }}>
      <path fillRule="evenodd" clipRule="evenodd" d="M3.49951 10C3.49951 9.58579 3.8353 9.25 4.24951 9.25L13.9391 9.25L11.2192 6.53036C10.9263 6.23748 10.9263 5.7626 11.2192 5.4697C11.512 5.17679 11.9869 5.17676 12.2798 5.46964L16.2802 9.46964C16.4209 9.6103 16.4999 9.80107 16.4999 10C16.4999 10.1989 16.4209 10.3897 16.2802 10.5304L12.2798 14.5304C11.9869 14.8232 11.512 14.8232 11.2192 14.5303C10.9263 14.2374 10.9263 13.7625 11.2192 13.4696L13.9391 10.75L4.24951 10.75C3.8353 10.75 3.49951 10.4142 3.49951 10Z" fill="currentColor"></path>
    </svg>
  );
}

const monthNamesSv = [
  "januari",
  "februari",
  "mars",
  "april",
  "maj",
  "juni",
  "juli",
  "augusti",
  "september",
  "oktober",
  "november",
  "december",
];

const monthNamesShort = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Maj",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dec",
];

const dayNamesShort = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];

function formatSvFromISO(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${monthNamesSv[d.getMonth()]} ${d.getFullYear()}`;
}

function formatCompactDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dayName = dayNamesShort[d.getDay()];
  const day = d.getDate();
  const month = monthNamesShort[d.getMonth()];
  const year = d.getFullYear();
  return `${dayName}, ${day} ${month} ${year}`;
}

function isCheckInReady(arrivalISO: string, checkInTime: string = "14:00"): boolean {
  return true;
}

export default function CheckInClient({ onLookup, onCommit }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const token = (params.get("token") || "").trim();
  const next = (params.get("next") || "").trim();

  const [step, setStep] = useState<Step>("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bookingId, setBookingId] = useState("");
  const [lastName, setLastName] = useState("");

  const [found, setFound] = useState<CheckInLookupResponse extends { ok: true } ? any : any>(null);
  const [nextHref, setNextHref] = useState<string>(token ? `/p/${token}` : (next || "/"));

  const titleText = useMemo(() => {
    if (step === "form") return "Hitta din bokning";
    if (step === "confirm") return "Bekräfta din bokning";
    if (step === "signature") return "Signera incheckning";
    return "Klart";
  }, [step]);

  const mutedText = useMemo(() => {
    if (step === "form") return "Ange bokningsnummer och efternamn för att fortsätta.";
    if (step === "confirm") return "Kontrollera att uppgifterna stämmer innan du fortsätter.";
    if (step === "signature") return "Rita din namnteckning för att slutföra incheckningen.";
    return "Du skickas vidare...";
  }, [step]);

  function canSubmitForm() {
    return bookingId.trim().length > 0 && lastName.trim().length > 0;
  }

  async function doLookup() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await onLookup({
        method: "booking",
        bookingId: bookingId.trim(),
        lastName: lastName.trim(),
        token: token || undefined,
      });

      if (!res || res.ok !== true) {
        setError((res as any)?.message || "Ingen bokning hittades.");
        return;
      }

      setFound(res.booking);
      setStep("confirm");
    } catch (e: any) {
      setError(e?.message || "Serverfel. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  function goToSignature() {
    setError(null);
    setStep("signature");
  }

  async function doCommit(signatureDataUrl: string) {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await onCommit({
        bookingId: found?.id,
        signatureDataUrl,
        token: token || undefined,
        next: next || undefined,
      });

      if (!res || res.ok !== true) {
        setError((res as any)?.message || "Kunde inte checka in.");
        return;
      }

      setNextHref(res.nextHref || (token ? `/p/${token}` : (next || "/")));
      setStep("success");
    } catch (e: any) {
      setError(e?.message || "Serverfel. Försök igen.");
    } finally {
      setBusy(false);
    }
  }


  function onBack() {
    if (step === "signature") {
      setError(null);
      setStep("confirm");
      return;
    }
    if (step === "confirm") {
      setError(null);
      setStep("form");
      return;
    }
    router.back();
  }

  // --- UI blocks ---

  const Header = (
    <div className="sektion73-card__header">
      <div>
        <h1 className="sektion73-title">{titleText}</h1>
        <p className="sektion73-muted">{mutedText}</p>
      </div>
    </div>
  );

  const FormStep = (
    <>
      {Header}

      <div className="sektion73-grid-2">
        <div className="sektion73-field">
          <div className="sektion73-float">
            <input
              id="sek-bookingId"
              className="sektion73-input"
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              placeholder=" "
              autoComplete="off"
            />
            <label className="sektion73-float__label" htmlFor="sek-bookingId">
              Bokningsnummer
            </label>
          </div>
        </div>

        <div className="sektion73-field">
          <div className="sektion73-float">
            <input
              id="sek-lastName"
              className="sektion73-input"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder=" "
              autoComplete="family-name"
            />
            <label className="sektion73-float__label" htmlFor="sek-lastName">
              Efternamn
            </label>
          </div>
        </div>
      </div>

      {error && <div className="sektion73-alert">{error}</div>}

      <div className="sektion73-cta">
        <button
          type="button"
          className="sektion73-btn sektion73-btn--primary"
          disabled={!canSubmitForm() || busy}
          onClick={doLookup}
          aria-busy={busy ? "true" : "false"}
        >
          {busy ? <AppLoader size={24} ariaLabel="Loading" /> : "Fortsätt"}
        </button>
      </div>
    </>
  );

  const checkInReady = found ? isCheckInReady(found.arrivalISO) : true;

  const ConfirmCard = (
    <div className="booking-card">
      <div
        className="booking-card__hero"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.55) 100%), url("${found?.heroImageUrl || ""}")`,
        }}
      >
        <div className={`booking-card__badge ${checkInReady ? "booking-card__badge--ready" : "booking-card__badge--pending"}`}>
          {checkInReady ? "Redo för incheckning" : "Incheckning från 14:00"}
        </div>
      </div>

      <div className="booking-card__content">
        <div className="booking-card__unit">
          {found?.unit || "Boende"}
        </div>

        <div className="booking-card__dates">
          <div className="booking-card__date">
            <div className="booking-card__date-label">Check-in</div>
            <div className="booking-card__date-value">
              {formatCompactDate(found?.arrivalISO || "")}
            </div>
          </div>

          <ArrowRightIcon />

          <div className="booking-card__date booking-card__date--right">
            <div className="booking-card__date-label">Check-out</div>
            <div className="booking-card__date-value">
              {formatCompactDate(found?.departureISO || "")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );


  const ConfirmStep = (
    <>
      {Header}

      {ConfirmCard}

      {error && <div className="sektion73-alert" style={{ marginTop: 12 }}>{error}</div>}

      <div className="sektion73-cta" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="sektion73-btn sektion73-btn--primary"
          disabled={busy}
          onClick={goToSignature}
          aria-busy={busy ? "true" : "false"}
        >
          {busy ? <AppLoader size={24} ariaLabel="Loading" /> : "Fortsätt"}
        </button>
      </div>
    </>
  );

  const SuccessStep = <SuccessView nextHref={nextHref} seconds={20} />;

  const termsUrl = found?.termsUrl || "https://apelviken.se/vistelsevillkor";

  return (
    <div className="sektion73-modal">
      <header className="sektion73-modal__header" data-step={step}>
        <button type="button" className="sektion73-backbtn" onClick={onBack} aria-label="Back">
          <ChevronLeftIcon />
        </button>
        <div className="sektion73-modal__title">Checka in</div>
      </header>

      <div className="sektion73-modal__body">
        {step === "form" && FormStep}
        {step === "confirm" && ConfirmStep}
        {step === "signature" && (
          <SignatureStep
            termsUrl={termsUrl}
            onSubmit={doCommit}
            busy={busy}
            error={error}
          />
        )}
        {step === "success" && SuccessStep}
      </div>
    </div>
  );
}
