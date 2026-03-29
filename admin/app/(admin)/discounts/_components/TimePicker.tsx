"use client";

import { useState, useRef, useEffect } from "react";

const TIMES: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    TIMES.push(`${h < 10 ? "0" : ""}${h}:${m === 0 ? "00" : "30"}`);
  }
}

export function TimePicker({
  value,
  onChange,
  placeholder = "Välj tid",
}: {
  value: string; // HH:mm
  onChange: (time: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Scroll to selected time when opening
  useEffect(() => {
    if (open && listRef.current && value) {
      const idx = TIMES.indexOf(value);
      if (idx > -1) {
        const el = listRef.current.children[idx] as HTMLElement;
        if (el) el.scrollIntoView({ block: "center" });
      }
    }
  }, [open, value]);

  return (
    <div className="disc-timepicker" ref={ref}>
      <div
        className="pf-collection-trigger"
        onClick={() => setOpen(!open)}
        style={{ cursor: "pointer" }}
      >
        <span className="material-symbols-rounded" style={{ fontSize: 18, color: "#616161", flexShrink: 0 }}>schedule</span>
        <span style={{ flex: 1, fontSize: 13, color: value ? "var(--admin-text)" : "var(--admin-text-tertiary)", height: 32, display: "flex", alignItems: "center" }}>
          {value || placeholder}
        </span>
      </div>

      {open && (
        <div className="disc-timepicker__dropdown" ref={listRef}>
          {TIMES.map((t) => (
            <button
              key={t}
              type="button"
              className={`disc-timepicker__option${t === value ? " disc-timepicker__option--selected" : ""}`}
              onClick={() => { onChange(t); setOpen(false); }}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
