"use client";

// TODO: Focus-trap logic and portal pattern here will be extracted to a shared
// _components/primitives/_shared/ module in a later cleanup pass when primitives
// move out of companies/_components/. Duplicated lightly in Combobox dropdown.
// Keep implementations drift-free until then.

/**
 * Modal — generic dialog primitive.
 *
 * Built for nested-modal use (admin flows occasionally open a "choose
 * customer" modal from inside a "new draft order" modal), so this component
 * tracks a module-level stack of open modal ids. The top of the stack owns
 * keyboard events; lower entries remain mounted but passive.
 *
 * Design notes:
 *
 * 1. Two-phase show/hide. `showing` controls DOM mount; `visible` controls
 *    the `--open` CSS class that drives the enter/exit transition. On
 *    close we flip `visible` to false immediately (triggering the exit
 *    animation), wait 200ms, then flip `showing` to false (unmounting).
 *    That keeps the transition visible without leaking an invisible
 *    portal in the DOM.
 *
 * 2. Focus management. On open we capture `document.activeElement` and
 *    focus `initialFocusRef?.current`, else the first focusable child,
 *    else the modal container itself. On close (or unmount) we restore
 *    focus to `returnFocusRef?.current` if provided, else the captured
 *    element.
 *
 * 3. Focus trap. A `keydown` listener on `window` intercepts Tab /
 *    Shift+Tab. If the currently-active element is the last focusable
 *    (or outside the modal), focus wraps to the first. Symmetric for
 *    Shift+Tab.
 *
 * 4. Body scroll lock is a single shared lock across all open modals —
 *    the first to mount records the current `body.style.overflow` and
 *    sets it to "hidden"; the last to unmount restores it.
 *
 * 5. Nested-modal stacking. Each modal pushes its id onto `modalStack`
 *    on mount and pops on unmount. The keydown handler only acts if
 *    `modalStack[top] === myId`, so ESC on a stacked pair only closes
 *    the topmost — the underlying modal stays put.
 *
 * 6. Portals are appended to `document.body`; later-mounted modals are
 *    later in the DOM, so natural stacking order gives them precedence
 *    at the same z-index. No per-modal z-index arithmetic required.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

// ── Module-level state ──────────────────────────────────────────
//
// Shared across all Modal instances in the same client bundle. The
// stack lets nested modals coordinate ESC + body scroll lock; the
// overflow snapshot is taken on the first push and restored on the
// last pop.

const modalStack: string[] = [];
let savedBodyOverflow = "";

// ── Focusable element helpers ───────────────────────────────────

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

// ── Public API ──────────────────────────────────────────────────

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

export function Modal({
  open,
  onClose,
  title,
  size = "md",
  dismissible = true,
  footer,
  children,
  initialFocusRef,
  returnFocusRef,
  id: idProp,
  ariaDescribedBy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: ModalSize;
  dismissible?: boolean;
  footer?: ReactNode;
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  id?: string;
  ariaDescribedBy?: string;
}) {
  const reactId = useId();
  const id = idProp ?? reactId;
  const titleId = `${id}-title`;

  // Stable id for stack tracking even if the `id` prop changes mid-life.
  const stackIdRef = useRef(id);
  stackIdRef.current = id;

  // Two-phase enter/exit animation. Initial states are `false` so that
  // SSR (where useEffect doesn't run) renders nothing — this is our
  // hydration guard. On the client the effect below flips `showing` to
  // true on the next tick, which mounts the portal.
  const [showing, setShowing] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setShowing(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const t = setTimeout(() => setShowing(false), 200);
    return () => clearTimeout(t);
  }, [open]);

  const modalRef = useRef<HTMLDivElement>(null);

  // Focus capture + initial focus + stack push + body lock + return focus.
  useEffect(() => {
    if (!showing) return;

    const previouslyFocused = (document.activeElement as HTMLElement | null) ?? null;
    const stackId = stackIdRef.current;

    modalStack.push(stackId);
    if (modalStack.length === 1) {
      savedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }

    const initialTarget =
      initialFocusRef?.current ??
      getFocusables(modalRef.current)[0] ??
      modalRef.current;
    initialTarget?.focus?.();

    return () => {
      const idx = modalStack.indexOf(stackId);
      if (idx !== -1) modalStack.splice(idx, 1);
      if (modalStack.length === 0) {
        document.body.style.overflow = savedBodyOverflow;
      }
      const restoreTarget = returnFocusRef?.current ?? previouslyFocused;
      restoreTarget?.focus?.();
    };
  }, [showing, initialFocusRef, returnFocusRef]);

  // Keyboard: ESC + Tab focus trap. Only the top modal acts.
  useEffect(() => {
    if (!showing) return;

    const handler = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== stackIdRef.current) return;

      if (e.key === "Escape") {
        if (dismissible) {
          e.preventDefault();
          onClose();
        }
        return;
      }
      if (e.key !== "Tab") return;

      const modal = modalRef.current;
      if (!modal) return;
      const focusables = getFocusables(modal);
      if (focusables.length === 0) {
        e.preventDefault();
        modal.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !modal.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !modal.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showing, dismissible, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== e.currentTarget) return;
      if (!dismissible) return;
      onClose();
    },
    [dismissible, onClose],
  );

  if (!showing) return null;

  return createPortal(
    <div
      className={`co-modal-backdrop${visible ? " co-modal-backdrop--open" : ""}`}
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
        className={`co-modal co-modal--${size}${visible ? " co-modal--open" : ""}`}
      >
        <header className="co-modal__header">
          <h2 id={titleId} className="co-modal__title">
            {title}
          </h2>
          {dismissible ? (
            <button
              type="button"
              className="co-modal__close"
              onClick={onClose}
              aria-label="Stäng"
            >
              ×
            </button>
          ) : null}
        </header>
        <div className="co-modal__body">{children}</div>
        {footer ? <div className="co-modal__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
