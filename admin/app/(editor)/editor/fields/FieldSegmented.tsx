"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { FieldWrapper } from "./FieldRenderer";

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

export function FieldSegmented({ field, value, onChange }: Props) {
  const current = (value as string) ?? field.default ?? "";
  const options = field.options ?? [];

  return (
    <FieldWrapper field={field}>
      <SegmentedControl
        options={options}
        value={current}
        onChange={(v) => onChange(field.key, v)}
      />
    </FieldWrapper>
  );
}

/**
 * Reusable segmented control with iOS-style sliding indicator.
 * Can be used standalone (e.g. in HeaderDetailPanel) or via FieldSegmented.
 */
export function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const initialRef = useRef(true);

  const updateIndicator = useCallback(() => {
    const container = containerRef.current;
    const btn = btnRefs.current.get(value);
    if (!container || !btn) {
      setIndicator(null);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setIndicator({
      left: btnRect.left - containerRect.left,
      width: btnRect.width,
    });
  }, [value]);

  // Update on value change
  useEffect(() => {
    updateIndicator();
    // After first render, allow transitions
    requestAnimationFrame(() => { initialRef.current = false; });
  }, [updateIndicator]);

  // Update on resize
  useEffect(() => {
    const observer = new ResizeObserver(updateIndicator);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateIndicator]);

  return (
    <div className="sf-segmented" ref={containerRef}>
      {indicator && (
        <div
          className="sf-segmented__indicator"
          style={{
            left: indicator.left,
            width: indicator.width,
            // Skip transition on initial render
            transition: initialRef.current ? "none" : undefined,
          }}
        />
      )}
      {options.map((opt) => (
        <button
          key={opt.value}
          ref={(el) => { if (el) btnRefs.current.set(opt.value, el); else btnRefs.current.delete(opt.value); }}
          type="button"
          className={`sf-segmented__btn${opt.value === value ? " sf-segmented__btn--active" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
