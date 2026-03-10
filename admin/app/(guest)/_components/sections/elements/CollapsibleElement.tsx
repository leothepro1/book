"use client";

import { useState } from "react";
import type { ResolvedElement } from "@/app/_lib/sections/types";

const SIZE_MAP: Record<string, string> = {
  xs: "0.8rem",
  sm: "0.875rem",
  md: "1rem",
  lg: "1.125rem",
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      style={{
        transition: "transform 0.2s ease",
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        flexShrink: 0,
      }}
    >
      <path
        d="M5 7l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CollapsibleElement({ resolved }: { resolved: ResolvedElement }) {
  const { settings } = resolved;
  const [open, setOpen] = useState(false);

  const content = settings.content as string;
  const alignment = (settings.alignment as string) || "left";
  const size = (settings.size as string) || "md";
  const labelClosed = (settings.label_closed as string) || "Visa mer";
  const labelOpen = (settings.label_open as string) || "Visa mindre";
  const toggleStyle = (settings.toggle_style as string) || "underline";

  const fontSize = SIZE_MAP[size] || SIZE_MAP.md;

  const baseToggleStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    padding: 0,
    marginTop: 8,
    cursor: "pointer",
    fontSize,
    fontWeight: 600,
    color: "var(--text)",
    opacity: 0.6,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };

  const toggleStyles: Record<string, React.CSSProperties> = {
    underline: {
      ...baseToggleStyle,
      textDecoration: "underline",
      textUnderlineOffset: "3px",
    },
    chevron: {
      ...baseToggleStyle,
      textDecoration: "none",
    },
    button: {
      ...baseToggleStyle,
      opacity: 1,
      padding: "7px 13px",
      background: "var(--button-bg)",
      color: "var(--button-fg)",
      borderRadius: "var(--button-radius, 6px)",
      border: "1px solid var(--button-bg)",
      fontWeight: 500,
      textDecoration: "none",
    },
  };

  return (
    <div style={{ textAlign: alignment as React.CSSProperties["textAlign"] }}>
      <div
        style={{
          fontSize,
          fontWeight: 400,
          color: "var(--text)",
          opacity: 0.8,
          margin: 0,
          lineHeight: 1.6,
          overflow: "hidden",
          maxHeight: open ? "none" : "4.8em",
        }}
        dangerouslySetInnerHTML={{ __html: content }}
      />
      <button
        onClick={() => setOpen((v) => !v)}
        style={toggleStyles[toggleStyle] || toggleStyles.underline}
      >
        {open ? labelOpen : labelClosed}
        {(toggleStyle === "chevron" || toggleStyle === "button") && (
          <ChevronIcon open={open} />
        )}
      </button>
    </div>
  );
}
