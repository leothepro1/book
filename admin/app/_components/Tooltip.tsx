"use client";

/**
 * Tooltip — Global, enterprise-grade tooltip system.
 *
 * TIMING MODEL (Figma / Google / Apple / Canva):
 *
 *   ENTER DELAY (500ms)
 *   Hover must be sustained before the tooltip appears.
 *   Prevents flash on fast mouse movement.
 *
 *   SCANNING (different element within 400ms)
 *   After a tooltip was shown on element A and user moves to element B,
 *   element B's tooltip appears with a short delay (150ms) — enough to
 *   feel intentional, not instant. This only works across DIFFERENT
 *   tooltip instances (toolbar scanning).
 *
 *   SAME-ELEMENT COOLDOWN (800ms)
 *   If you leave an element and come back to THE SAME one quickly,
 *   the tooltip does NOT re-appear instantly. It requires the full
 *   enter delay again. This prevents the annoying "sticky tooltip"
 *   when wiggling the mouse on a single button.
 *
 *   CLICK SUPPRESSION
 *   Clicking dismisses the tooltip and suppresses it for 600ms.
 *   The user took an action — the tooltip's job is done.
 *
 *   EXIT GRACE (80ms)
 *   Tiny delay before hiding to tolerate pixel-gap jitter.
 *
 *   ANIMATION
 *   Fade + translateY, 0.12s ease-out.
 */

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactElement,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

// ─── Timing constants (ms) ──────────────────────────────────

const ENTER_DELAY = 200;
const SCAN_DELAY = 50;
const SCAN_WINDOW = 400;
const SAME_ELEMENT_COOLDOWN = 800;
const CLICK_SUPPRESS = 600;
const EXIT_GRACE = 80;

// ─── Global state shared across all instances ───────────────

let lastClosedTime = 0;
let lastClosedId: string | null = null;
let lastClickedTime = 0;
let lastClickedId: string | null = null;

let idCounter = 0;

// ─── Placement ──────────────────────────────────────────────

type Placement = "top" | "bottom";

function computePosition(
  trigger: DOMRect,
  tooltip: DOMRect,
  placement: Placement,
  gap: number,
): { top: number; left: number; actualPlacement: Placement } {
  let top: number;
  let actualPlacement = placement;

  const left = Math.max(
    8,
    Math.min(
      trigger.left + trigger.width / 2 - tooltip.width / 2,
      window.innerWidth - tooltip.width - 8,
    ),
  );

  if (placement === "bottom") {
    top = trigger.bottom + gap;
    if (top + tooltip.height > window.innerHeight - 8) {
      top = trigger.top - tooltip.height - gap;
      actualPlacement = "top";
    }
  } else {
    top = trigger.top - tooltip.height - gap;
    if (top < 8) {
      top = trigger.bottom + gap;
      actualPlacement = "bottom";
    }
  }

  return { top, left, actualPlacement };
}

// ─── Arrow ──────────────────────────────────────────────────

function arrowStyle(
  triggerRect: DOMRect,
  tooltipLeft: number,
  placement: Placement,
): CSSProperties {
  const arrowLeft = triggerRect.left + triggerRect.width / 2 - tooltipLeft;
  const base: CSSProperties = {
    position: "absolute",
    left: arrowLeft,
    transform: "translateX(-50%) rotate(45deg)",
    width: 8,
    height: 8,
    background: "#1a1a1a",
    borderRadius: 1,
  };

  return placement === "bottom"
    ? { ...base, top: -4 }
    : { ...base, bottom: -4 };
}

// ─── Component ──────────────────────────────────────────────

type TooltipProps = {
  label: string;
  placement?: Placement;
  gap?: number;
  children: ReactElement;
  disabled?: boolean;
};

export function Tooltip({
  label,
  placement = "bottom",
  gap = 6,
  children,
  disabled = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; actualPlacement: Placement } | null>(null);

  const triggerRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const enterTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const exitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const instanceId = useRef(`tt_${++idCounter}`);

  useEffect(() => {
    setMounted(true);
    return () => {
      clearTimeout(enterTimer.current);
      clearTimeout(exitTimer.current);
    };
  }, []);

  const isChildDisabled = useCallback((): boolean => {
    const el = triggerRef.current;
    if (!el) return false;
    // Check the first interactive child (button, input, a) or the wrapper itself
    const target = el.querySelector("button, input, a, [role='button']") as HTMLElement | null;
    const check = target || el;
    // HTML disabled attribute
    if ((check as HTMLButtonElement).disabled) return true;
    // aria-disabled
    if (check.getAttribute("aria-disabled") === "true") return true;
    // CSS pointer-events: none
    const style = getComputedStyle(check);
    if (style.pointerEvents === "none") return true;
    // .disabled class
    if (check.classList.contains("disabled")) return true;
    return false;
  }, []);

  const show = useCallback(() => {
    clearTimeout(exitTimer.current);
    clearTimeout(enterTimer.current);
    if (disabled || isChildDisabled()) return;

    const now = Date.now();
    const id = instanceId.current;

    // Click suppression: if this element was just clicked, don't show
    if (lastClickedId === id && now - lastClickedTime < CLICK_SUPPRESS) {
      return;
    }

    // Determine delay
    let delay = ENTER_DELAY;

    const timeSinceClose = now - lastClosedTime;
    const closedSameElement = lastClosedId === id;

    if (timeSinceClose < SCAN_WINDOW && !closedSameElement) {
      // Scanning: moved from a DIFFERENT tooltip → short delay
      delay = SCAN_DELAY;
    } else if (closedSameElement && timeSinceClose < SAME_ELEMENT_COOLDOWN) {
      // Same element re-hover too quickly → full delay (feels less aggressive)
      delay = ENTER_DELAY;
    }

    enterTimer.current = setTimeout(() => {
      setVisible(true);
    }, delay);
  }, [disabled, isChildDisabled]);

  const hide = useCallback(() => {
    clearTimeout(enterTimer.current);
    exitTimer.current = setTimeout(() => {
      setVisible(false);
      lastClosedTime = Date.now();
      lastClosedId = instanceId.current;
    }, EXIT_GRACE);
  }, []);

  const dismiss = useCallback(() => {
    clearTimeout(enterTimer.current);
    clearTimeout(exitTimer.current);
    setVisible(false);
    lastClickedTime = Date.now();
    lastClickedId = instanceId.current;
    lastClosedTime = Date.now();
    lastClosedId = instanceId.current;
  }, []);

  // Position
  useEffect(() => {
    if (!visible || !triggerRef.current) return;
    const measure = () => {
      const triggerRect = triggerRef.current!.getBoundingClientRect();
      const tooltipEl = tooltipRef.current;
      if (!tooltipEl) return;
      const tooltipRect = tooltipEl.getBoundingClientRect();
      setPos(computePosition(triggerRect, tooltipRect, placement, gap));
    };
    requestAnimationFrame(measure);
  }, [visible, label, placement, gap]);

  useEffect(() => {
    if (!visible) setPos(null);
  }, [visible]);

  const trigger = (
    <span
      ref={triggerRef as React.RefObject<HTMLSpanElement>}
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
      onPointerDown={dismiss}
      style={{ display: "inline-flex" }}
    >
      {children}
    </span>
  );

  const tooltip =
    mounted && visible
      ? createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            style={{
              position: "fixed",
              zIndex: 99999,
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              opacity: pos ? 1 : 0,
              transform: "translateY(0)",
              transition: "none",
              pointerEvents: "none",
              background: "#1a1a1a",
              color: "#fff",
              fontSize: 12,
              fontWeight: 450,
              fontFamily: "var(--admin-font)",
              lineHeight: 1,
              padding: "7px 9px",
              borderRadius: 6,
              whiteSpace: "nowrap",
              letterSpacing: "0.01em",
            }}
          >
            {label}
            {pos && triggerRef.current && (
              <span
                style={arrowStyle(
                  triggerRef.current.getBoundingClientRect(),
                  pos.left,
                  pos.actualPlacement,
                )}
              />
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {trigger}
      {tooltip}
    </>
  );
}
