"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Method = "booking" | "nameDate" | "email";

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
  "januari","februari","mars","april","maj","juni",
  "juli","augusti","september","oktober","november","december"
];
const dowSv = ["må","ti","on","to","fr","lö","sö"];

function formatSv(d: Date) {
  return `${d.getDate()} ${monthNamesSv[d.getMonth()]} ${d.getFullYear()}`;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function emailOk(v: string) {
  const s = v.trim();
  if (!s) return false;
  // enkel men robust enough
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

type DatePickerProps = {
  label: string;
  valueISO: string;
  onChangeISO: (iso: string) => void;
  mode: "oneClickClose" | "saveCancel"; // oneClickClose = välj 1 datum och stäng direkt
};

function DatePicker({ label, valueISO, onChangeISO, mode }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [baseMonth, setBaseMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const saved = useMemo(() => parseISODate(valueISO), [valueISO]);

  // tempSelected används bara i save/cancel-läget
  const [tempSelected, setTempSelected] = useState<Date | null>(null);

  useEffect(() => {
    if (mode === "saveCancel") {
      setTempSelected(saved ? new Date(saved) : null);
    }
  }, [mode, valueISO]); // eslint-disable-line react-hooks/exhaustive-deps

  const isMobile = () =>
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(max-width: 680px)").matches;

  function openPicker() {
    if (mode === "saveCancel") {
      setTempSelected(saved ? new Date(saved) : null);
    }
    setOpen(true);
  }

  function closePicker() {
    setOpen(false);
  }

  function commitDate(d: Date) {
    const iso = toISODate(d);
    onChangeISO(iso);
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

    const months: JSX.Element[] = [];

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
            className={[
              "sektion73-day",
              disabled ? "is-disabled" : "",
              isSel ? "is-selected" : "",
            ].join(" ").trim()}
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
            <div className="sektion73-cal__title">{monthNamesSv[m]} {y}</div>

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

          <div className="sektion73-cal__dow">
            {dowSv.map((x) => (
              <div key={x}>{x}</div>
            ))}
          </div>

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

  return (
    <div className="sektion73-field">
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
            <path fillRule="evenodd" d="M8 4h8V2.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5V4h1a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V2.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5V4zM4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v1H4V7zm0 3h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9z" clipRule="evenodd"></path>
          </svg>
        </span>

        <span className="sektion73-datebtn__label">{labelText}</span>
        <span className="sektion73-datebtn__chev" aria-hidden="true">›</span>
      </button>

      {/* Desktop dropdown */}
      <div
        className={["sektion73-datepicker", open && !isMobile() ? "is-open" : ""].join(" ").trim()}
        role="dialog"
        aria-label="Välj datum"
        aria-hidden={open && !isMobile() ? "false" : "true"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sektion73-datepicker__inner">
          <div className="sektion73-calwrap">{renderMonths(2)}</div>

          {mode === "saveCancel" && (
            <div className="sektion73-calactions">
              <button type="button" className="sektion73-btn sektion73-btn--ghost" onClick={cancel}>
                Avbryt
              </button>
              <button type="button" className="sektion73-btn sektion73-btn--primary" onClick={save} disabled={!tempSelected}>
                Spara
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile sheet */}
      <div className={["sektion73-sheet", open && isMobile() ? "is-open" : ""].join(" ").trim()} aria-hidden={open && isMobile() ? "false" : "true"}>
        <div
          className="sektion73-sheet__overlay"
          onClick={() => {
            mode === "saveCancel" ? cancel() : closePicker();
          }}
        />
        <div className="sektion73-sheet__panel" role="dialog" aria-label="Välj datum" onClick={(e) => e.stopPropagation()}>
          <div className="sektion73-sheet__grab" aria-hidden="true" />
          <div className="sektion73-sheet__content">
            <div className="sektion73-calwrap">{renderMonths(1)}</div>

            {mode === "saveCancel" && (
              <div className="sektion73-calactions">
                <button type="button" className="sektion73-btn sektion73-btn--ghost" onClick={cancel}>
                  Avbryt
                </button>
                <button type="button" className="sektion73-btn sektion73-btn--primary" onClick={save} disabled={!tempSelected}>
                  Spara
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Outside click + ESC */}
      {open && (
        <div
          className="sektion73-modalguard"
          onClick={() => {
            mode === "saveCancel" ? cancel() : closePicker();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              mode === "saveCancel" ? cancel() : closePicker();
            }
          }}
        />
      )}
    </div>
  );
}

type Props = {
  // server action (från page.tsx)
  onSubmit: (payload: {
    method: Method;
    bookingId?: string;
    lastName?: string;
    name?: string;
    arrivalDateISO?: string;
    email?: string;
    departureDateISO?: string;
  }) => Promise<void>;
};

export default function CheckInClient({ onSubmit }: Props) {
  const [method, setMethod] = useState<Method>("booking");
  const [busy, setBusy] = useState(false);

  // fields
  const [bookingId, setBookingId] = useState("");
  const [lastName, setLastName] = useState("");

  const [fullName, setFullName] = useState("");
  const [arrivalISO, setArrivalISO] = useState("");

  const [email, setEmail] = useState("");
  const [emailLastName, setEmailLastName] = useState("");
  const [departureISO, setDepartureISO] = useState("");

  // errors
  const [error, setError] = useState<string | null>(null);

  const bookingIdRef = useRef<HTMLInputElement | null>(null);
  const lastNameRef = useRef<HTMLInputElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  // focus on method change
  useEffect(() => {
    setError(null);
    const t = setTimeout(() => {
      if (method === "booking") bookingIdRef.current?.focus();
      if (method === "nameDate") nameRef.current?.focus();
      if (method === "email") emailRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [method]);

  const canSubmit = useMemo(() => {
    if (method === "booking") {
      return bookingId.trim().length >= 3 && lastName.trim().length >= 2;
    }
    if (method === "nameDate") {
      return fullName.trim().length >= 3 && !!parseISODate(arrivalISO);
    }
    // email
    return emailOk(email) && emailLastName.trim().length >= 2 && !!parseISODate(departureISO);
  }, [method, bookingId, lastName, fullName, arrivalISO, email, emailLastName, departureISO]);

  async function submit() {
    setError(null);
    if (!canSubmit || busy) return;

    setBusy(true);
    try {
      if (method === "booking") {
        await onSubmit({ method, bookingId: bookingId.trim(), lastName: lastName.trim() });
      } else if (method === "nameDate") {
        await onSubmit({ method, name: fullName.trim(), arrivalDateISO: arrivalISO });
      } else {
        await onSubmit({
          method,
          email: email.trim(),
          lastName: emailLastName.trim(),
          departureDateISO: departureISO,
        });
      }
    } catch (e: any) {
      setError(e?.message || "Något gick fel. Försök igen.");
      // fokusera på första rimliga fält
      if (method === "booking") bookingIdRef.current?.focus();
      if (method === "nameDate") nameRef.current?.focus();
      if (method === "email") emailRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sektion73-root">
      <div className="sektion73-card">
        <header className="sektion73-card__header">
          <div>
            <h1 className="sektion73-title">Checka in</h1>
            <p className="sektion73-muted">
              Välj ett sätt att hitta din bokning.
            </p>
          </div>
        </header>

        {/* Method selector */}
        <div className="sektion73-segment" role="tablist" aria-label="Inloggningsmetod">
          <button
            type="button"
            className={["sektion73-segment__btn", method === "booking" ? "is-active" : ""].join(" ").trim()}
            onClick={() => setMethod("booking")}
            role="tab"
            aria-selected={method === "booking"}
          >
            Bokningsnummer
          </button>
          <button
            type="button"
            className={["sektion73-segment__btn", method === "nameDate" ? "is-active" : ""].join(" ").trim()}
            onClick={() => setMethod("nameDate")}
            role="tab"
            aria-selected={method === "nameDate"}
          >
            Namn + datum
          </button>
          <button
            type="button"
            className={["sektion73-segment__btn", method === "email" ? "is-active" : ""].join(" ").trim()}
            onClick={() => setMethod("email")}
            role="tab"
            aria-selected={method === "email"}
          >
            E-post
          </button>
        </div>

        {/* Fields */}
        <div className="sektion73-grid-2" style={{ marginTop: 18 }}>
          {method === "booking" && (
            <>
              <div className="sektion73-field">
                <label className="sektion73-label" htmlFor="bookingId">Bokningsnummer</label>
                <input
                  id="bookingId"
                  ref={bookingIdRef}
                  className="sektion73-input"
                  value={bookingId}
                  onChange={(e) => setBookingId(e.target.value)}
                  autoComplete="off"
                  inputMode="text"
                  placeholder="t.ex. ABC123"
                />
                <div className="sektion73-help">Finns i ditt bekräftelsemail.</div>
              </div>

              <div className="sektion73-field">
                <label className="sektion73-label" htmlFor="lastName">Efternamn</label>
                <input
                  id="lastName"
                  ref={lastNameRef}
                  className="sektion73-input"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  placeholder="t.ex. Andersson"
                />
              </div>
            </>
          )}

          {method === "nameDate" && (
            <>
              <div className="sektion73-field">
                <label className="sektion73-label" htmlFor="fullName">Namn</label>
                <input
                  id="fullName"
                  ref={nameRef}
                  className="sektion73-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  placeholder="Förnamn Efternamn"
                />
                <div className="sektion73-help">Skriv som i bokningen.</div>
              </div>

              <DatePicker
                label="Incheckningsdatum"
                valueISO={arrivalISO}
                onChangeISO={setArrivalISO}
                mode="saveCancel"
              />
            </>
          )}

          {method === "email" && (
            <>
              <div className="sektion73-field">
                <label className="sektion73-label" htmlFor="email">E-post</label>
                <input
                  id="email"
                  ref={emailRef}
                  className="sektion73-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="namn@exempel.se"
                />
              </div>

              <div className="sektion73-field">
                <label className="sektion73-label" htmlFor="emailLastName">Efternamn</label>
                <input
                  id="emailLastName"
                  className="sektion73-input"
                  value={emailLastName}
                  onChange={(e) => setEmailLastName(e.target.value)}
                  autoComplete="family-name"
                  placeholder="t.ex. Andersson"
                />
              </div>

              <DatePicker
                label="Utcheckningsdatum"
                valueISO={departureISO}
                onChangeISO={setDepartureISO}
                mode="oneClickClose"
              />
            </>
          )}
        </div>

        {error && (
          <div className="sektion73-alert" role="alert" aria-live="polite">
            {error}
          </div>
        )}

        <footer className="sektion73-actions">
          <button
            type="button"
            className="sektion73-btn sektion73-btn--primary"
            disabled={!canSubmit || busy}
            onClick={submit}
          >
            {busy ? "Söker..." : "Fortsätt"}
          </button>

          <div className="sektion73-footnote">
            Genom att fortsätta godkänner du att vi verifierar dina uppgifter mot bokningen.
          </div>
        </footer>
      </div>
    </div>
  );
}
