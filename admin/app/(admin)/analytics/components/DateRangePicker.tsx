"use client";

import { useState, useRef, useEffect } from "react";
import { EditorIcon } from "@/app/_components/EditorIcon";

type Props = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
};

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => daysAgo(1);

const PRESETS = [
  { label: "Idag", getDates: () => [today(), today()] },
  { label: "Igår", getDates: () => [yesterday(), yesterday()] },
  { label: "Senaste 7 dagarna", getDates: () => [daysAgo(7), today()] },
  { label: "Senaste 30 dagarna", getDates: () => [daysAgo(30), today()] },
  { label: "Senaste 90 dagarna", getDates: () => [daysAgo(90), today()] },
  { label: "Senaste 12 månaderna", getDates: () => [daysAgo(365), today()] },
];

function formatRange(from: string, to: string): string {
  const f = new Date(from);
  const t = new Date(to);
  const fStr = f.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
  const tStr = t.toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
  if (from === to) return fStr + " " + f.getFullYear();
  return `${fStr} – ${tStr}`;
}

export function DateRangePicker({ from, to, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div className="analytics-date-picker" ref={ref}>
      <button
        type="button"
        className="analytics-date-picker__trigger"
        onClick={() => setOpen(!open)}
      >
        <EditorIcon name="calendar_today" size={16} />
        <span>{formatRange(from, to)}</span>
        <EditorIcon name="expand_more" size={16} />
      </button>
      {open && (
        <div className="analytics-date-picker__dropdown">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="analytics-date-preset"
              onClick={() => {
                const [f, t] = p.getDates();
                onChange(f, t);
                setOpen(false);
              }}
            >
              {p.label}
            </button>
          ))}
          <div className="analytics-date-custom">
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="analytics-date-input"
            />
            <span style={{ color: "var(--admin-text-tertiary)" }}>–</span>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              max={today()}
              onChange={(e) => setCustomTo(e.target.value)}
              className="analytics-date-input"
            />
            <button
              type="button"
              className="analytics-date-apply"
              onClick={() => {
                onChange(customFrom, customTo);
                setOpen(false);
              }}
            >
              Använd
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
