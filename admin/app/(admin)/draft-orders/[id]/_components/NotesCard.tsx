"use client";

import { type CSSProperties } from "react";

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
  marginTop: 12,
  marginBottom: 4,
};

const NOTE_BODY: CSSProperties = {
  whiteSpace: "pre-wrap",
  fontSize: 13,
  color: "var(--admin-text)",
  margin: 0,
};

const EMPTY: CSSProperties = {
  ...NOTE_BODY,
  color: "var(--admin-text-muted)",
};

interface NotesCardProps {
  internalNote: string | null;
  customerNote: string | null;
}

export function NotesCard({ internalNote, customerNote }: NotesCardProps) {
  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 0 }}>
        <span className="pf-card-title">Anteckningar</span>
      </div>

      <div style={{ ...SECTION_TITLE, marginTop: 12 }}>Intern anteckning</div>
      {internalNote && internalNote.length > 0 ? (
        <p style={NOTE_BODY}>{internalNote}</p>
      ) : (
        <p style={EMPTY}>—</p>
      )}

      <div style={SECTION_TITLE}>Anteckning till kund</div>
      {customerNote && customerNote.length > 0 ? (
        <p style={NOTE_BODY}>{customerNote}</p>
      ) : (
        <p style={EMPTY}>—</p>
      )}
    </div>
  );
}
