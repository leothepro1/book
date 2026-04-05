"use client";

import { useEffect } from "react";

/**
 * Global ripple effect — Material Design 3 touch feedback.
 *
 * Mount once in the admin shell. Delegates from document so every
 * current and future `.ripple` element gets the effect with zero
 * per-component wiring.
 *
 * Two-phase animation (matching Google's implementation):
 *   Phase 1 — Expand: on pointerdown, a circle scales from the
 *             click origin to cover the entire element (0.8s)
 *   Phase 2 — Fade:   on pointerup, IF the expand animation has
 *             finished, fade out. If not, wait for it to finish
 *             first, then fade. This prevents cut-off ripples.
 */
export function RippleInit() {
  useEffect(() => {
    const SELECTOR = ".ripple, .admin-btn, .settings-btn--connect, .settings-btn--outline, .app-card, .sa-row--clickable, .products-row";

    function findTarget(e: PointerEvent): HTMLElement | null {
      return (e.target as HTMLElement).closest?.(SELECTOR) as HTMLElement | null;
    }

    function createWave(el: HTMLElement, e: PointerEvent) {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Distance to farthest corner — ensures full coverage from any click point
      const dx = Math.max(x, rect.width - x);
      const dy = Math.max(y, rect.height - y);
      const diameter = Math.sqrt(dx * dx + dy * dy) * 2.2;

      const wave = document.createElement("span");
      wave.className = "ripple__wave ripple__wave--in";
      wave.style.width = `${diameter}px`;
      wave.style.height = `${diameter}px`;
      wave.style.left = `${x - diameter / 2}px`;
      wave.style.top = `${y - diameter / 2}px`;

      el.appendChild(wave);

      let expandDone = false;
      let released = false;

      wave.addEventListener("animationend", () => {
        expandDone = true;
        if (released) fadeOut(wave);
      }, { once: true });

      return {
        release() {
          released = true;
          if (expandDone) fadeOut(wave);
        },
      };
    }

    function fadeOut(wave: HTMLElement) {
      wave.classList.remove("ripple__wave--in");
      wave.classList.add("ripple__wave--out");
      // Keep current scale by setting inline transform
      wave.style.transform = "scale(1)";
      wave.addEventListener("animationend", () => wave.remove(), { once: true });
    }

    let active: { release(): void } | null = null;

    function onDown(e: PointerEvent) {
      // Only primary button (left click / touch)
      if (e.button !== 0) return;
      const el = findTarget(e);
      if (!el) return;
      // Release any previous (edge case: fast re-clicks)
      if (active) active.release();
      active = createWave(el, e);
    }

    function onUp() {
      if (active) {
        active.release();
        active = null;
      }
    }

    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointercancel", onUp, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return null;
}
