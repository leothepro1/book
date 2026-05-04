'use client';

/**
 * Tooltip — global hover-explain primitive.
 *
 * TIMING MODEL (Figma / Google / Apple / Canva — empirically tuned):
 *
 *   ENTER DELAY (200ms)
 *   Hover must be sustained before the tooltip appears.
 *   Prevents flash on fast mouse movement.
 *
 *   SCANNING (different element within 400ms)
 *   After a tooltip was shown on element A and the user moves to
 *   element B, B's tooltip appears with a short delay (50ms) — long
 *   enough to feel intentional, not instant. Cross-instance state
 *   shared at the module level (`lastClosedTime` etc).
 *
 *   SAME-ELEMENT COOLDOWN (800ms)
 *   Leave + return to the same element quickly → full enter delay
 *   again. Prevents "sticky tooltip" wiggle.
 *
 *   CLICK SUPPRESSION (600ms)
 *   Clicking dismisses the tooltip and suppresses it for 600ms — the
 *   user took an action, the tooltip's job is done.
 *
 *   EXIT GRACE (80ms)
 *   Tiny delay before hiding to tolerate pixel-gap jitter between
 *   trigger and tooltip.
 *
 * The visual chrome (bg, fg, font, padding, radius, arrow geometry)
 * is tokenised — see `--tooltip-*` in base.css. Positioning lives
 * in the component since it's measurement-driven.
 *
 * Promoted from `app/_components/Tooltip.tsx`; that file is now a
 * re-export shim so existing imports keep working.
 */

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactElement,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { getAdminPortalRoot } from './_lib/portal-root';
import './Tooltip.css';

const ENTER_DELAY = 200;
const SCAN_DELAY = 50;
const SCAN_WINDOW = 400;
const SAME_ELEMENT_COOLDOWN = 800;
const CLICK_SUPPRESS = 600;
const EXIT_GRACE = 80;

let lastClosedTime = 0;
let lastClosedId: string | null = null;
let lastClickedTime = 0;
let lastClickedId: string | null = null;
let idCounter = 0;

export type TooltipPlacement = 'top' | 'bottom';

function computePosition(
  trigger: DOMRect,
  tooltip: DOMRect,
  placement: TooltipPlacement,
  gap: number,
): { top: number; left: number; actualPlacement: TooltipPlacement } {
  let top: number;
  let actualPlacement = placement;

  const left = Math.max(
    8,
    Math.min(
      trigger.left + trigger.width / 2 - tooltip.width / 2,
      window.innerWidth - tooltip.width - 8,
    ),
  );

  if (placement === 'bottom') {
    top = trigger.bottom + gap;
    if (top + tooltip.height > window.innerHeight - 8) {
      top = trigger.top - tooltip.height - gap;
      actualPlacement = 'top';
    }
  } else {
    top = trigger.top - tooltip.height - gap;
    if (top < 8) {
      top = trigger.bottom + gap;
      actualPlacement = 'bottom';
    }
  }

  return { top, left, actualPlacement };
}

/* Arrow centred on the trigger horizontally; flipped above/below
   based on resolved placement. Uses `currentColor` so the arrow
   tracks the tooltip pill colour automatically across themes. */
function arrowStyle(
  triggerRect: DOMRect,
  tooltipLeft: number,
  placement: TooltipPlacement,
): CSSProperties {
  const arrowLeft = triggerRect.left + triggerRect.width / 2 - tooltipLeft;
  const base: CSSProperties = {
    left: arrowLeft,
  };
  return placement === 'bottom'
    ? { ...base, top: -4 }
    : { ...base, bottom: -4 };
}

export type TooltipProps = {
  label: string;
  placement?: TooltipPlacement;
  /** Pixel gap between trigger and tooltip. Default 6. */
  gap?: number;
  /** When true, the tooltip never shows. Useful for conditional
      affordances. Disabled trigger elements (native `disabled`,
      `aria-disabled="true"`, `pointer-events: none`, or `.disabled`)
      are auto-detected and treated the same way. */
  disabled?: boolean;
  children: ReactElement;
};

export function Tooltip({
  label,
  placement = 'bottom',
  gap = 6,
  disabled = false,
  children,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    actualPlacement: TooltipPlacement;
  } | null>(null);

  const triggerRef = useRef<HTMLSpanElement>(null);
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
    const target = el.querySelector(
      "button, input, a, [role='button']",
    ) as HTMLElement | null;
    const check = target || el;
    if ((check as HTMLButtonElement).disabled) return true;
    if (check.getAttribute('aria-disabled') === 'true') return true;
    const style = getComputedStyle(check);
    if (style.pointerEvents === 'none') return true;
    if (check.classList.contains('disabled')) return true;
    return false;
  }, []);

  const show = useCallback(() => {
    clearTimeout(exitTimer.current);
    clearTimeout(enterTimer.current);
    if (disabled || isChildDisabled()) return;

    const now = Date.now();
    const id = instanceId.current;

    if (lastClickedId === id && now - lastClickedTime < CLICK_SUPPRESS) {
      return;
    }

    let delay = ENTER_DELAY;
    const timeSinceClose = now - lastClosedTime;
    const closedSameElement = lastClosedId === id;

    if (timeSinceClose < SCAN_WINDOW && !closedSameElement) {
      delay = SCAN_DELAY;
    } else if (closedSameElement && timeSinceClose < SAME_ELEMENT_COOLDOWN) {
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

  // Position after layout — measure rect, apply, repeat on prop change.
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
      ref={triggerRef}
      className="ui-tooltip__trigger"
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
      onPointerDown={dismiss}
    >
      {children}
    </span>
  );

  const portalRoot = mounted ? getAdminPortalRoot() : null;
  const tooltip =
    mounted && visible && portalRoot
      ? createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            className="ui-tooltip"
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              opacity: pos ? 1 : 0,
            }}
          >
            {label}
            {pos && triggerRef.current && (
              <span
                className="ui-tooltip__arrow"
                aria-hidden="true"
                style={arrowStyle(
                  triggerRef.current.getBoundingClientRect(),
                  pos.left,
                  pos.actualPlacement,
                )}
              />
            )}
          </div>,
          portalRoot,
        )
      : null;

  return (
    <>
      {trigger}
      {tooltip}
    </>
  );
}
