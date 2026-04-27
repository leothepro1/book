"use client";

import { useId, type CSSProperties } from "react";

const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

const TEXTAREA_STYLE: CSSProperties = {
  width: "100%",
  border: "1px solid var(--admin-border)",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: "var(--font-sm)",
  fontFamily: "inherit",
  fontWeight: 400,
  color: "var(--admin-text)",
  background: "#fff",
  resize: "vertical",
  lineHeight: 1.5,
  minHeight: 100,
  outline: "none",
};

const FOOTER_STYLE: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: 6,
  fontSize: 12,
  color: "var(--admin-text-tertiary)",
};

const MAX_LENGTH = 5000;

interface NotesCardProps {
  value: string;
  onChange: (next: string) => void;
}

export function NotesCard({ value, onChange }: NotesCardProps) {
  const textareaId = useId();
  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <label htmlFor={textareaId} className="pf-card-title">
          Anteckning
        </label>
      </div>
      <textarea
        id={textareaId}
        style={TEXTAREA_STYLE}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        maxLength={MAX_LENGTH}
        placeholder="Intern anteckning, syns inte för kund."
      />
      <div style={FOOTER_STYLE}>
        <span aria-live="polite">
          {value.length} / {MAX_LENGTH}
        </span>
      </div>
    </div>
  );
}
