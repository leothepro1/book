"use client";

import { useMemo, useState, useTransition } from "react";
import { checkInLookup } from "./actions";

type Method = "bookingNumber" | "nameArrival" | "email";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function CheckInLogin() {
  const [method, setMethod] = useState<Method>("bookingNumber");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>("");

  // date values (YYYY-MM-DD)
  const [arrivalDate, setArrivalDate] = useState("");
  const [departureDate, setDepartureDate] = useState("");

  const t = useMemo(() => {
    return {
      title: "Checka in",
      subtitle: "Välj hur du vill hitta din bokning",
      opt1: "Bokningsnummer",
      opt2: "Namn och datum",
      opt3: "E-post",
      continue: pending ? "Söker..." : "Fortsätt",
      bookingNumber: "Bokningsnummer",
      lastName: "Efternamn",
      name: "Namn",
      arrival: "Incheckningsdatum",
      email: "E-post",
      departure: "Utcheckningsdatum",
      pickDate: "Välj datum",
    };
  }, [pending]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    fd.set("method", method);
    if (method === "nameArrival") fd.set("arrivalDate", arrivalDate);
    if (method === "email") fd.set("departureDate", departureDate);

    startTransition(async () => {
      try {
        await checkInLookup(fd);
      } catch (err: any) {
        setError(err?.message || "Något gick fel.");
      }
    });
  }

  return (
    <div style={{ padding: "18px 17px 90px 17px", color: "var(--text)" }}>
      <div className="g-card" style={{ padding: 16 }}>
        <div className="g-heading" style={{ fontSize: 22, marginBottom: 6 }}>
          {t.title}
        </div>
        <div style={{ opacity: 0.75, marginBottom: 14 }}>{t.subtitle}</div>

        <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
          <button type="button" className={`g-choice ${method === "bookingNumber" ? "is-active" : ""}`} onClick={() => setMethod("bookingNumber")}>
            <span>{t.opt1}</span><span className="g-choice__dot" aria-hidden />
          </button>
          <button type="button" className={`g-choice ${method === "nameArrival" ? "is-active" : ""}`} onClick={() => setMethod("nameArrival")}>
            <span>{t.opt2}</span><span className="g-choice__dot" aria-hidden />
          </button>
          <button type="button" className={`g-choice ${method === "email" ? "is-active" : ""}`} onClick={() => setMethod("email")}>
            <span>{t.opt3}</span><span className="g-choice__dot" aria-hidden />
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          {method === "bookingNumber" && (
            <>
              <div className="g-field">
                <label className="g-label">{t.bookingNumber}</label>
                <input className="g-input" name="bookingNumber" placeholder="t.ex. ckx123..." required />
              </div>
              <div className="g-field">
                <label className="g-label">{t.lastName}</label>
                <input className="g-input" name="lastName" placeholder="Efternamn" required />
              </div>
            </>
          )}

          {method === "nameArrival" && (
            <>
              <div className="g-field">
                <label className="g-label">{t.name}</label>
                <input className="g-input" name="name" placeholder="Förnamn Efternamn" required />
              </div>

              <div className="g-field">
                <label className="g-label">{t.arrival}</label>
                <input
                  className="g-input"
                  type="date"
                  min={todayISO()}
                  value={arrivalDate}
                  onChange={(e) => setArrivalDate(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          {method === "email" && (
            <>
              <div className="g-field">
                <label className="g-label">{t.email}</label>
                <input className="g-input" name="email" type="email" placeholder="namn@exempel.se" required />
              </div>
              <div className="g-field">
                <label className="g-label">{t.lastName}</label>
                <input className="g-input" name="lastName" placeholder="Efternamn" required />
              </div>
              <div className="g-field">
                <label className="g-label">{t.departure}</label>
                <input
                  className="g-input"
                  type="date"
                  min={todayISO()}
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          {error && (
            <div style={{ color: "salmon", fontWeight: 700 }}>
              {error}
            </div>
          )}

          <button className="g-btn g-btn-primary" type="submit" disabled={pending}>
            {t.continue}
          </button>
        </form>
      </div>
    </div>
  );
}
