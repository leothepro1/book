"use client";

import type * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import AppLoader from "../_components/AppLoader";

type Method = "booking" | "nameDeparture" | "email";
type Step = "choose" | "form";

type SubmitPayload = {
  method: Method;
  bookingId?: string;
  lastName?: string;
  name?: string;
  email?: string;
  departureDateISO?: string;
};

type Props = {
  onSubmit: (payload: SubmitPayload) => Promise<void>;
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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseISODate(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s || "").trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return d;
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
const dowSv = ["må", "ti", "on", "to", "fr", "lö", "sö"];

function formatSv(d: Date) {
  return `${d.getDate()} ${monthNamesSv[d.getMonth()]} ${d.getFullYear()}`;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function emailOk(v: string) {
  const s = v.trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

type DatePickerProps = {
  label: string;
  valueISO: string;
  onChangeISO: (iso: string) => void;
  mode: "oneClickClose" | "saveCancel";
  closeSignal?: string;
};

function DatePicker({ label, valueISO, onChangeISO, mode, closeSignal }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [baseMonth, setBaseMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const saved = useMemo(() => parseISODate(valueISO), [valueISO]);
  const [tempSelected, setTempSelected] = useState<Date | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (mode === "saveCancel") setTempSelected(saved ? new Date(saved) : null);
  }, [mode, saved]);

  useEffect(() => {
    if (!closeSignal) return;
    setOpen(false);
  }, [closeSignal]);

  const isMobile = () =>
    typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 680px)").matches;

  function openPicker() {
    if (mode === "saveCancel") setTempSelected(saved ? new Date(saved) : null);
    setOpen(true);
  }

  function closePicker() {
    setOpen(false);
  }

  function commitDate(d: Date) {
    onChangeISO(toISODate(d));
  }

  function onPick(d: Date) {
    if (mode === "oneClickClose") {
      commitDate(d);
      closePicker();
      return;
    }
    setTempSelected(new Date(d));
  }

  function save() {
    if (!tempSelected) return;
    commitDate(tempSelected);
    closePicker();
  }

  function cancel() {
    setTempSelected(saved ? new Date(saved) : null);
    closePicker();
  }

  function renderMonths(monthsCount: 1 | 2) {
    const today = startOfDay(new Date());
    const selected = mode === "saveCancel" ? tempSelected : saved;

    const months: React.ReactNode[] = [];

    for (let i = 0; i < monthsCount; i++) {
      const monthDate = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + i, 1);
      const y = monthDate.getFullYear();
      const m = monthDate.getMonth();

      const firstDay = new Date(y, m, 1);
      const jsDow = firstDay.getDay(); // 0=sön
      const mondayIndex = jsDow === 0 ? 6 : jsDow - 1;
      const daysInMonth = new Date(y, m + 1, 0).getDate();

      const blanks = Array.from({ length: mondayIndex }, (_, idx) => (
        <button key={`b-${idx}`} type="button" className="sektion73-day is-muted" disabled aria-hidden="true" />
      ));

      const days = Array.from({ length: daysInMonth }, (_, idx) => {
        const day = idx + 1;
        const d = new Date(y, m, day);
        d.setHours(0, 0, 0, 0);

        const disabled = d < today;
        const isSel = selected ? sameDay(d, selected) : false;

        return (
          <button
            key={`d-${day}`}
            type="button"
            className={["sektion73-day", disabled ? "is-disabled" : "", isSel ? "is-selected" : ""].join(" ").trim()}
            disabled={disabled}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!disabled) onPick(d);
            }}
          >
            {day}
          </button>
        );
      });

      months.push(
        <div key={`${y}-${m}`} className="sektion73-cal">
          <div className="sektion73-cal__head">
            <div className="sektion73-cal__title">
              {monthNamesSv[m]} {y}
            </div>

            {i === 0 && (
              <div className="sektion73-cal__nav">
                <button
                  type="button"
                  className="sektion73-cal__navbtn"
                  aria-label="Föregående månad"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setBaseMonth(new Date(baseMonth.getFullYear(), baseMonth.getMonth() - 1, 1));
                  }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="sektion73-cal__navbtn"
                  aria-label="Nästa månad"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setBaseMonth(new Date(baseMonth.getFullYear(), baseMonth.getMonth() + 1, 1));
                  }}
                >
                  ›
                </button>
              </div>
            )}
          </div>

          <div className="sektion73-cal__dow">{dowSv.map((x) => <div key={x}>{x}</div>)}</div>
          <div className="sektion73-cal__grid">
            {blanks}
            {days}
          </div>
        </div>
      );
    }

    return months;
  }

  const labelText = useMemo(() => {
    const d = parseISODate(valueISO);
    return d ? formatSv(d) : "Välj datum";
  }, [valueISO]);

  const [present, setPresent] = useState(false);
  const [phaseOpen, setPhaseOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setPresent(true);
      setClosing(false);
      setPhaseOpen(false);

      const raf = requestAnimationFrame(() => setPhaseOpen(true));
      return () => cancelAnimationFrame(raf);
    }

    if (present) {
      setClosing(true);
      setPhaseOpen(false);

      const t = window.setTimeout(() => {
        setPresent(false);
        setClosing(false);
      }, 360);
      return () => window.clearTimeout(t);
    }
  }, [open, present]);

  const mobileSheet =
    mounted && present && isMobile()
      ? createPortal(
          <div className={["sektion73-sheet", phaseOpen ? "is-open" : "", closing ? "is-closing" : ""].join(" ").trim()}>
            <div className="sektion73-sheet__overlay" onClick={closePicker} />
            <div className="sektion73-sheet__panel" role="dialog" aria-label="Välj datum">
              <div className="sektion73-sheet__grab" />
              <div className="sektion73-sheet__content">
                <div className="sektion73-calwrap">{renderMonths(1)}</div>

                {mode === "saveCancel" ? (
                  <div className="sektion73-calactions" style={{ marginTop: 10 }}>
                    <button type="button" className="sektion73-btn" onClick={cancel}>
                      Avbryt
                    </button>
                    <button
                      type="button"
                      className="sektion73-btn sektion73-btn--primary"
                      onClick={save}
                      disabled={!tempSelected}
                    >
                      Spara
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>Välj ett datum så stängs kalendern.</div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const desktopOpen = open && !isMobile();

  return (
    <div className="sektion73-field" style={{ position: "relative" }}>
      <label className="sektion73-label">{label}</label>

      <button
        type="button"
        className="sektion73-datebtn"
        aria-expanded={open ? "true" : "false"}
        onClick={(e) => {
          e.preventDefault();
          open ? closePicker() : openPicker();
        }}
      >
        <span className="sektion73-datebtn__left" aria-hidden="true">
          <svg className="uitk-icon uitk-field-icon" aria-hidden="true" viewBox="0 0 24 24">
            <path d="M7 12a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H7z"></path>
            <path
              fillRule="evenodd"
              d="M8 4h8V2.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5V4h1a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V2.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5V4zM4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v1H4V7zm0 3h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9z"
              clipRule="evenodd"
            ></path>
          </svg>
        </span>

        <span className="sektion73-datebtn__label">{labelText}</span>
        <span className="sektion73-datebtn__chev" aria-hidden="true">
          ›
        </span>
      </button>

      <div
        className={["sektion73-datepicker", desktopOpen ? "is-open" : ""].join(" ").trim()}
        role="dialog"
        aria-label="Välj datum"
        aria-hidden={desktopOpen ? "false" : "true"}
        style={{ pointerEvents: desktopOpen ? "auto" : "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sektion73-datepicker__inner">
          <div className="sektion73-calwrap">{renderMonths(typeof window !== "undefined" && window.innerWidth >= 720 ? 2 : 1)}</div>

          {mode === "saveCancel" && (
            <div className="sektion73-calactions">
              <button type="button" className="sektion73-btn" onClick={cancel}>
                Avbryt
              </button>
              <button type="button" className="sektion73-btn sektion73-btn--primary" onClick={save} disabled={!tempSelected}>
                Spara
              </button>
            </div>
          )}
        </div>
      </div>

      {mobileSheet}
    </div>
  );
}

function titleForMethod(m: Method) {
  if (m === "booking") return "Bokningsnummer";
  if (m === "nameDeparture") return "Namn + datum";
  return "E-post";
}

export default function CheckOutClient({ onSubmit }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const [step, setStep] = useState<Step>("choose");
  const [method, setMethod] = useState<Method>("booking");
  const [busy, setBusy] = useState(false);

  // ✅ loader för 3 val-knappar (step "choose")
  const [pickBusy, setPickBusy] = useState<Method | null>(null);

  // booking
  const [bookingId, setBookingId] = useState("");
  const [lastName, setLastName] = useState("");

  // name+arrival
  const [fullName, setFullName] = useState("");
  const [arrivalISO, setArrivalISO] = useState("");

  // email
  const [email, setEmail] = useState("");
  const [emailLastName, setEmailLastName] = useState("");
  const [departureISO, setDepartureISO] = useState("");

  const [error, setError] = useState<string | null>(null);

  const closeSignal = `${step}:${method}`;

  useEffect(() => {
    const m = (params.get("method") || "").trim();
    if (m === "booking" || m === "nameDeparture" || m === "email") {
      setMethod(m);
      setStep("form");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ när vi lämnar choose-steget: släck loader på valknapparna
  useEffect(() => {
    if (step !== "choose") setPickBusy(null);
  }, [step]);

  function onBack() {
    if (step === "form") {
      setError(null);
      setStep("choose");
      return;
    }
    router.back();
  }

  function pickMethod(next: Method) {
    setError(null);
    setPickBusy(next); // ✅ text försvinner i vald knapp, loader visas
    setMethod(next);
    setStep("form");
  }

  function canSubmit() {
    if (method === "booking") return bookingId.trim().length > 0 && lastName.trim().length > 0;
    if (method === "nameDeparture") return fullName.trim().length > 0 && arrivalISO.trim().length > 0;
    return emailOk(email) && emailLastName.trim().length > 0 && departureISO.trim().length > 0;
  }

  async function submit() {
    setError(null);

    try {
      setBusy(true);

      if (method === "booking") {
        if (!bookingId.trim() || !lastName.trim()) throw new Error("Fyll i bokningsnummer och efternamn.");
        await onSubmit({ method, bookingId: bookingId.trim(), lastName: lastName.trim() });
        return;
      }

      if (method === "nameDeparture") {
        if (!fullName.trim() || !arrivalISO.trim()) throw new Error("Fyll i namn och incheckningsdatum.");
        await onSubmit({ method, name: fullName.trim(), departureDateISO: arrivalISO.trim() });
        return;
      }

      if (!emailOk(email) || !emailLastName.trim() || !departureISO.trim()) {
        throw new Error("Fyll i e-post, efternamn och utcheckningsdatum.");
      }

      await onSubmit({
        method,
        email: email.trim(),
        lastName: emailLastName.trim(),
        departureDateISO: departureISO.trim(),
      });
    } catch (e: any) {
      setError(e?.message || "Något gick fel. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  function renderForm() {
    if (method === "booking") {
      return (
        <>
          <div className="sektion73-card__header">
            <div>
              <h1 className="sektion73-title">Ange bokningsuppgifter</h1>
              <p className="sektion73-muted">Skriv in bokningsnummer och efternamn.</p>
            </div>
          </div>

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

          <div className="sektion73-footnote" style={{ marginTop: 12 }}>
            Har du inget bokningsnummer? Gå tillbaka och välj ett annat alternativ.
          </div>
        </>
      );
    }

    if (method === "nameDeparture") {
      return (
        <>
          <div className="sektion73-card__header">
            <div>
              <h1 className="sektion73-title">Hitta bokning</h1>
              <p className="sektion73-muted">Ange namn och incheckningsdatum.</p>
            </div>
          </div>

          <div className="sektion73-grid-2">
            <div className="sektion73-field">
              <div className="sektion73-float">
                <input
                  id="sek-fullName"
                  className="sektion73-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder=" "
                  autoComplete="name"
                />
                <label className="sektion73-float__label" htmlFor="sek-fullName">
                  Namn
                </label>
              </div>

              <div className="sektion73-help">Det räcker med för- eller efternamn.</div>
            </div>

            <DatePicker
              label="Incheckningsdatum"
              valueISO={arrivalISO}
              onChangeISO={setArrivalISO}
              mode="oneClickClose"
              closeSignal={closeSignal}
            />
          </div>
        </>
      );
    }

    return (
      <>
        <div className="sektion73-card__header">
          <div>
            <h1 className="sektion73-title">Verifiera via e-post</h1>
            <p className="sektion73-muted">Ange e-post, efternamn och utcheckningsdatum.</p>
          </div>
        </div>

        <div className="sektion73-grid-2">
          <div className="sektion73-field">
            <div className="sektion73-float">
              <input
                id="sek-email"
                className="sektion73-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder=" "
                autoComplete="email"
                inputMode="email"
              />
              <label className="sektion73-float__label" htmlFor="sek-email">
                E-post
              </label>
            </div>
          </div>

          <div className="sektion73-field">
            <div className="sektion73-float">
              <input
                id="sek-emailLastName"
                className="sektion73-input"
                value={emailLastName}
                onChange={(e) => setEmailLastName(e.target.value)}
                placeholder=" "
                autoComplete="family-name"
              />
              <label className="sektion73-float__label" htmlFor="sek-emailLastName">
                Efternamn
              </label>
            </div>
          </div>

          <DatePicker
            label="Utcheckningsdatum"
            valueISO={departureISO}
            onChangeISO={setDepartureISO}
            mode="oneClickClose"
            closeSignal={closeSignal}
          />
        </div>
      </>
    );
  }

  return (
    <div className="sektion73-modal">
      <header className="sektion73-modal__header">
        <button type="button" className="sektion73-backbtn" onClick={onBack} aria-label="Back">
          <ChevronLeftIcon />
        </button>
        <div className="sektion73-modal__title">{step === "choose" ? "Checka in" : titleForMethod(method)}</div>
      </header>

      <div className="sektion73-modal__body">
        <div className="sektion73-steps" style={{ transform: step === "choose" ? "translateX(0%)" : "translateX(-100%)" }}>
          <section className="sektion73-step" aria-hidden={step !== "choose"} style={{ pointerEvents: step === "choose" ? "auto" : "none" }}>
            <div className="sektion73-card__header">
              <div>
                <h1 className="sektion73-title">Checka in</h1>
                <p className="sektion73-muted">Välj hur du vill hitta din bokning.</p>
              </div>
            </div>

            <div className="sektion73-choicegrid">
              <button
                type="button"
                className="sektion73-choicebtn"
                disabled={pickBusy !== null}
                onClick={() => pickMethod("booking")}
              >
                <div className="sektion73-choicebtn__title">
                  {pickBusy === "booking" ? <AppLoader size={18} ariaLabel="Loading" /> : "Bokningsnummer"}
                </div>
              </button>

              <button
                type="button"
                className="sektion73-choicebtn"
                disabled={pickBusy !== null}
                onClick={() => pickMethod("email")}
              >
                <div className="sektion73-choicebtn__title">
                  {pickBusy === "email" ? <AppLoader size={18} ariaLabel="Loading" /> : "E-post"}
                </div>
              </button>

              <div className="sektion73-divider" aria-hidden="true">
                <span className="sektion73-divider__line" />
                <span className="sektion73-divider__text">ELLER</span>
                <span className="sektion73-divider__line" />
              </div>

              <button
                type="button"
                className="sektion73-choicebtn"
                disabled={pickBusy !== null}
                onClick={() => pickMethod("nameDeparture")}
              >
                <div className="sektion73-choicebtn__title">
                  {pickBusy === "nameDeparture" ? <AppLoader size={18} ariaLabel="Loading" /> : "Namn + datum"}
                </div>
              </button>
            </div>

            {error && <div className="sektion73-alert">{error}</div>}
          </section>

          <section className="sektion73-step" aria-hidden={step !== "form"} style={{ pointerEvents: step === "form" ? "auto" : "none" }}>
            {renderForm()}
            {error && <div className="sektion73-alert">{error}</div>}

            <div className="sektion73-cta">
              <button
                type="button"
                className="sektion73-btn sektion73-btn--primary"
                disabled={busy || !canSubmit()}
                onClick={submit}
                aria-busy={busy ? "true" : "false"}
              >
                {busy ? <AppLoader size={18} ariaLabel="Loading" /> : "Fortsätt"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
