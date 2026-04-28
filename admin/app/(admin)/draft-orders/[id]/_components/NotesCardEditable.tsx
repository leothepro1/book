"use client";

import { useId, type CSSProperties } from "react";

const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

const SECTION_TITLE: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--admin-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 4,
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
  minHeight: 80,
  outline: "none",
};

const COUNTER_STYLE: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: 4,
  fontSize: 12,
  color: "var(--admin-text-tertiary)",
};

const MAX_LENGTH = 5000;

interface NotesCardEditableProps {
  value: { internalNote: string; customerNote: string };
  onChange: (next: { internalNote: string; customerNote: string }) => void;
}

export function NotesCardEditable({ value, onChange }: NotesCardEditableProps) {
  const internalId = useId();
  const customerId = useId();
  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <span className="pf-card-title">Anteckningar</span>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label htmlFor={internalId} style={SECTION_TITLE}>
          Intern anteckning
        </label>
        <textarea
          id={internalId}
          style={TEXTAREA_STYLE}
          value={value.internalNote}
          onChange={(e) =>
            onChange({ ...value, internalNote: e.target.value })
          }
          rows={4}
          maxLength={MAX_LENGTH}
          placeholder="Intern anteckning, syns inte för kund."
        />
        <div style={COUNTER_STYLE}>
          <span aria-live="polite">
            {value.internalNote.length} / {MAX_LENGTH}
          </span>
        </div>
      </div>

      <div>
        <label htmlFor={customerId} style={SECTION_TITLE}>
          Anteckning till kund
        </label>
        <textarea
          id={customerId}
          style={TEXTAREA_STYLE}
          value={value.customerNote}
          onChange={(e) =>
            onChange({ ...value, customerNote: e.target.value })
          }
          rows={4}
          maxLength={MAX_LENGTH}
          placeholder="Anteckning som syns för kunden på fakturan."
        />
        <div style={COUNTER_STYLE}>
          <span aria-live="polite">
            {value.customerNote.length} / {MAX_LENGTH}
          </span>
        </div>
      </div>
    </div>
  );
}
