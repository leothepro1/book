"use client";

import type { ResolvedElement } from "@/app/_lib/sections/types";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

/**
 * Product Booking Form — datum/gäst-väljare.
 *
 * Layout:
 * ┌─────────────┬─────────────┐
 * │ Incheckning  │ Utcheckning │
 * ├─────────────┴─────────────┤
 * │ Gäster              ▾     │
 * └───────────────────────────┘
 *
 * Border runt hela. Läser/skriver URL-params.
 */

export function ProductBookingFormElement({ resolved: _resolved }: { resolved: ResolvedElement }) {
  const searchParams = useSearchParams();
  const [checkIn, setCheckIn] = useState(searchParams.get("checkIn") ?? "");
  const [checkOut, setCheckOut] = useState(searchParams.get("checkOut") ?? "");
  const [guests, setGuests] = useState(parseInt(searchParams.get("guests") ?? "2", 10));
  const today = new Date().toISOString().split("T")[0];

  const handleUpdate = () => {
    if (!checkIn || !checkOut || guests < 1) return;
    const params = new URLSearchParams(window.location.search);
    params.set("checkIn", checkIn);
    params.set("checkOut", checkOut);
    params.set("guests", String(guests));
    window.location.search = params.toString();
  };

  return (
    <div
      style={{
        border: "1px solid color-mix(in srgb, var(--text, #000) 15%, transparent)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {/* Row 1: Incheckning | Utcheckning */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <div
          style={{
            padding: "10px 14px",
            borderRight: "1px solid color-mix(in srgb, var(--text, #000) 15%, transparent)",
          }}
        >
          <div style={{ fontSize: "0.625rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "color-mix(in srgb, var(--text, #000) 50%, transparent)", marginBottom: 2 }}>
            Incheckning
          </div>
          <input
            type="date"
            value={checkIn}
            min={today}
            onChange={(e) => { setCheckIn(e.target.value); if (checkOut && e.target.value >= checkOut) setCheckOut(""); }}
            onBlur={handleUpdate}
            style={{
              border: "none",
              background: "transparent",
              fontSize: "0.8125rem",
              fontWeight: 500,
              color: checkIn ? "var(--text)" : "color-mix(in srgb, var(--text, #000) 40%, transparent)",
              padding: 0,
              width: "100%",
              fontFamily: "inherit",
              outline: "none",
            }}
          />
        </div>
        <div style={{ padding: "10px 14px" }}>
          <div style={{ fontSize: "0.625rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "color-mix(in srgb, var(--text, #000) 50%, transparent)", marginBottom: 2 }}>
            Utcheckning
          </div>
          <input
            type="date"
            value={checkOut}
            min={checkIn || today}
            onChange={(e) => setCheckOut(e.target.value)}
            onBlur={handleUpdate}
            style={{
              border: "none",
              background: "transparent",
              fontSize: "0.8125rem",
              fontWeight: 500,
              color: checkOut ? "var(--text)" : "color-mix(in srgb, var(--text, #000) 40%, transparent)",
              padding: 0,
              width: "100%",
              fontFamily: "inherit",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "color-mix(in srgb, var(--text, #000) 15%, transparent)" }} />

      {/* Row 2: Gäster */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "0.625rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "color-mix(in srgb, var(--text, #000) 50%, transparent)", marginBottom: 2 }}>
            Gäster
          </div>
          <input
            type="number"
            value={guests}
            min={1}
            max={99}
            onChange={(e) => setGuests(parseInt(e.target.value, 10) || 1)}
            onBlur={handleUpdate}
            style={{
              border: "none",
              background: "transparent",
              fontSize: "0.8125rem",
              fontWeight: 500,
              color: "var(--text)",
              padding: 0,
              width: 60,
              fontFamily: "inherit",
              outline: "none",
            }}
          />
        </div>
        <span
          className="material-symbols-rounded"
          style={{ fontSize: 20, color: "color-mix(in srgb, var(--text, #000) 40%, transparent)" }}
        >
          expand_more
        </span>
      </div>
    </div>
  );
}
