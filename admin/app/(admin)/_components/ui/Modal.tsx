'use client';

import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type AnimationEvent,
  type ReactNode,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';

/**
 * Modal — Phase 2 primitive. Compound API with three variants that
 * share backdrop, shape, shadow, transitions, and a11y handling. The
 * variant only governs scroll behaviour and footer layout:
 *
 *   - `default`        — body scrolls; header/footer scroll with it
 *   - `sticky`         — header + footer pinned; only body scrolls
 *   - `single-button`  — body scrolls; footer button stretches
 *                        full-width (acknowledge-style modal)
 *
 * Compose via subcomponents:
 *
 *   <Modal open={open} onClose={close} variant="sticky">
 *     <Modal.Header>Spara ändringar</Modal.Header>
 *     <Modal.Body>...</Modal.Body>
 *     <Modal.Footer>
 *       <Button variant="secondary" onClick={close}>Avbryt</Button>
 *       <Button variant="primary" onClick={save}>Spara</Button>
 *     </Modal.Footer>
 *   </Modal>
 *
 * Behaviours included by default (all overridable):
 *   - Portaled to document.body (escapes z-index / overflow traps)
 *   - ESC closes (disabled when `dismissible={false}`)
 *   - Backdrop click closes (same flag)
 *   - Body scroll lock while open
 *   - Focus trap with Tab cycling
 *   - Initial focus on first focusable element inside the modal
 *   - Focus restored to the trigger element on close
 *   - role="dialog" aria-modal="true" with title/body labelling via
 *     auto-generated ids (Header sets aria-labelledby, Body sets
 *     aria-describedby)
 */

export type ModalVariant = 'default' | 'sticky' | 'single-button';

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  variant?: ModalVariant;
  /** When false, ESC and backdrop clicks no longer close. Default true. */
  dismissible?: boolean;
  children: ReactNode;
  className?: string;
  /** Accessible label fallback when no <Modal.Header> is rendered. */
  'aria-label'?: string;
};

type ModalContextValue = {
  variant: ModalVariant;
  titleId: string;
  bodyId: string;
  onClose: () => void;
};

const ModalContext = createContext<ModalContextValue | null>(null);

function useModalContext(component: string): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) {
    throw new Error(`<${component}> must be used inside <Modal>`);
  }
  return ctx;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function ModalRoot({
  open,
  onClose,
  variant = 'default',
  dismissible = true,
  children,
  className,
  'aria-label': ariaLabel,
}: ModalProps) {
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Mounted lifecycle is decoupled from the `open` prop so the
  // modal can run an exit animation before unmounting. Sequence:
  //   open=false → mounted=true, animationState="exit" → animation
  //   runs → onAnimationEnd: mounted=false → unmount.
  // If the parent re-opens mid-exit, animationState flips to "enter"
  // (derived from `open`) and the browser swaps animations cleanly.
  //
  // The mount-on-open transition is handled via React's recommended
  // "compare previous prop in render" pattern — preferable to a
  // useEffect with setState in cleanup. Unmount-on-exit happens
  // inside the animationend handler, where state-update-from-event
  // is the natural place.
  const [mounted, setMounted] = useState(open);
  const [prevOpen, setPrevOpen] = useState(open);
  const animationState: 'enter' | 'exit' = open ? 'enter' : 'exit';

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setMounted(true);
  }

  // Check whether <Modal.Header> is rendered among direct children
  // so we can decide between `aria-labelledby` (preferred when a
  // header exists) and falling back to `aria-label`. Done at parent
  // render time so the dialog attributes are correct on first paint
  // — a useRef toggled inside the Header would update too late.
  const hasHeader = Children.toArray(children).some(
    (child) => isValidElement(child) && child.type === ModalHeader,
  );

  // Lifecycle: scroll lock, ESC, focus restore. Effect runs on
  // every open transition so re-opening the same modal correctly
  // re-locks scroll and re-traps focus.
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null) ?? null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    // Defer initial focus until after portal mount so dialogRef is
    // populated and the user-rendered children have committed.
    const focusTimer = window.setTimeout(() => {
      const focusables = getFocusable(dialogRef.current);
      (focusables[0] ?? dialogRef.current)?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      const prev = previousFocusRef.current;
      if (prev && document.contains(prev)) {
        prev.focus();
      }
    };
  }, [open, onClose, dismissible]);

  if (!mounted) return null;
  if (typeof document === 'undefined') return null;

  const onAnimationEnd = (e: AnimationEvent<HTMLDivElement>) => {
    // Only react to the dialog element's own animation; child
    // animations (spinners, transitions inside body) bubble up to
    // the same node and would otherwise spuriously trigger unmount.
    if (e.target !== e.currentTarget) return;
    // Only unmount once the exit anim has finished AND the parent
    // hasn't re-opened in the meantime.
    if (animationState === 'exit' && !open) {
      setMounted(false);
    }
  };

  const onOverlayMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    // Only close if the press *and* release happened on the overlay
    // itself — avoids accidental dismiss when a drag selection
    // inside the dialog ends on the overlay.
    if (!dismissible) return;
    if (e.target !== e.currentTarget) return;
    onClose();
  };

  // Tab cycling — wraps focus around the modal's focusable set.
  const onDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const focusables = getFocusable(dialogRef.current);
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const cls = ['ui-modal', `ui-modal--${variant}`, className]
    .filter(Boolean)
    .join(' ');

  const ctx: ModalContextValue = {
    variant,
    titleId,
    bodyId,
    onClose,
  };

  return createPortal(
    <div
      className="ui-modal-overlay"
      onMouseDown={onOverlayMouseDown}
      data-state={animationState}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hasHeader ? titleId : undefined}
        aria-describedby={bodyId}
        aria-label={ariaLabel}
        className={cls}
        data-state={animationState}
        onKeyDown={onDialogKeyDown}
        onAnimationEnd={onAnimationEnd}
        tabIndex={-1}
      >
        <ModalContext.Provider value={ctx}>{children}</ModalContext.Provider>
      </div>
    </div>,
    document.body,
  );
}

function ModalHeader({ children }: { children: ReactNode }) {
  const { titleId } = useModalContext('Modal.Header');
  return (
    <header className="ui-modal__header">
      <h2 id={titleId} className="ui-modal__title">
        {children}
      </h2>
    </header>
  );
}

function ModalBody({ children }: { children: ReactNode }) {
  const { bodyId } = useModalContext('Modal.Body');
  return (
    <div id={bodyId} className="ui-modal__body">
      {children}
    </div>
  );
}

function ModalFooter({ children }: { children: ReactNode }) {
  // No context call here — footer doesn't depend on context, but
  // keeping it inside the same module preserves the compound API.
  return <footer className="ui-modal__footer">{children}</footer>;
}

// Compound API: <Modal>.Header / .Body / .Footer
export const Modal = Object.assign(ModalRoot, {
  Header: ModalHeader,
  Body: ModalBody,
  Footer: ModalFooter,
});
