"use client";

/**
 * Shared Material Symbol icon renderer (guest portal).
 *
 * Uses Google Material Symbols Outlined font (loaded in root layout).
 * The icon name is rendered as text content — the font uses ligatures
 * to convert e.g. "search" into the search icon glyph.
 *
 * All values (size, weight) are explicit — no CSS var magic.
 * Tenants control every property directly through element settings.
 *
 * LIGATURE DETECTION:
 * When a ligature matches, the font collapses all characters into a
 * single glyph that occupies exactly 1em × 1em. When it doesn't match,
 * the characters render individually and the text is wider than 1em.
 *
 * We detect this by comparing scrollWidth (full content width) against
 * clientWidth (visible container). If scrollWidth > clientWidth, it's
 * plain text (no match) — we hide it via opacity. When the ligature
 * matches, scrollWidth ≈ clientWidth and we show it.
 */

import { useRef, useEffect, useState, useCallback } from "react";

type MaterialIconProps = {
  name: string;
  size?: number;
  weight?: number;
  fill?: boolean;
  color?: string;
};

export function MaterialIcon({ name, size = 24, weight = 400, fill = false, color }: MaterialIconProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [matched, setMatched] = useState(false);

  const check = useCallback(() => {
    const el = ref.current;
    if (!el || !name) {
      setMatched(false);
      return;
    }
    // Ligature glyph: scrollWidth ≈ clientWidth (single glyph fits)
    // Plain text: scrollWidth > clientWidth (characters overflow)
    setMatched(el.scrollWidth <= el.clientWidth + 1);
  }, [name]);

  useEffect(() => {
    check();
    // Re-check after font loads (font may not be ready on first render)
    document.fonts.ready.then(check);
  }, [check]);

  return (
    <span
      ref={ref}
      className="material-symbols-outlined"
      style={{
        fontSize: size,
        width: size,
        height: size,
        overflow: "hidden",
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        userSelect: "none",
        fontVariationSettings: `'wght' ${weight}, 'FILL' ${fill ? 1 : 0}`,
        opacity: matched ? 1 : 0,
        transition: "opacity 0.15s ease",
        ...(color ? { color } : {}),
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
