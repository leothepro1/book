"use client";

import { useId, type CSSProperties } from "react";

const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

const INPUT_STYLE: CSSProperties = {
  width: "100%",
  border: "1px solid var(--admin-border)",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: "var(--font-sm)",
  fontFamily: "inherit",
  color: "var(--admin-text)",
  background: "#fff",
  outline: "none",
};

const HELP_STYLE: CSSProperties = {
  display: "block",
  marginTop: 6,
  fontSize: 12,
  color: "var(--admin-text-tertiary)",
  lineHeight: 1.4,
};

// Local Y/M/D string — never use toISOString() here, it converts to UTC and
// can shift the date by a day in tz offsets like Europe/Stockholm.
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromIsoDate(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

interface ExpiresAtCardProps {
  value: Date;
  onChange: (next: Date) => void;
}

export function ExpiresAtCard({ value, onChange }: ExpiresAtCardProps) {
  const inputId = useId();
  const today = toIsoDate(new Date());
  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <label htmlFor={inputId} className="pf-card-title">
          Utgångsdatum
        </label>
      </div>
      <input
        id={inputId}
        type="date"
        style={INPUT_STYLE}
        value={toIsoDate(value)}
        min={today}
        onChange={(e) => {
          const raw = e.target.value;
          if (!raw) return;
          onChange(fromIsoDate(raw));
        }}
      />
      <span style={HELP_STYLE}>
        Utkastet raderas automatiskt efter detta datum.
      </span>
    </div>
  );
}
