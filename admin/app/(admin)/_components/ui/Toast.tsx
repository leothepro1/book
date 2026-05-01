'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import './Toast.css';

/**
 * Toast — Apple-style status pill notifications.
 *
 * Architecture: provider + imperative API. `<ToastProvider>` mounts
 * once at the app root, owns the toast stack, and renders the live
 * region in a portal. Any child can call `useToast()` to push a
 * new toast — no per-feature state machinery, no prop drilling.
 *
 * Variants (8) — share chrome (radius, shadow, padding, font,
 * close-button affordance), differ in colour treatment and layout:
 *
 *   - default      — white pill, dark text, close button
 *   - multi-line   — same chrome, message wraps to multiple lines
 *   - with-jsx     — same chrome, message is ReactNode (bold spans etc)
 *   - with-link    — same chrome, message contains an <a> with underline
 *   - action       — vertical layout, two buttons bottom-right, no close,
 *                    no auto-dismiss (user must act)
 *   - success      — blue (#0072F5) bg, white text
 *   - warning      — orange (#FF990A) bg, dark text
 *   - error        — red (#DA2F35) bg, white text
 *
 * Stack: multiple toasts queue at the bottom-centre, newest at the
 * bottom. Each toast auto-dismisses after `duration` ms (default
 * 3000) — except `action`, which has no auto-dismiss. Symmetric
 * enter / exit animations: state="enter" → render, state="exit" →
 * exit animation → setTimeout removes from the array.
 *
 * A11y: the stack is `role="region" aria-live="polite"` so screen
 * readers announce new toasts as they appear without stealing focus.
 * Close button has aria-label="Stäng notis"; action buttons inherit
 * their labels from the consumer-supplied action.label.
 */

export type ToastVariant =
  | 'default'
  | 'multi-line'
  | 'with-jsx'
  | 'with-link'
  | 'action'
  | 'success'
  | 'warning'
  | 'error';

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastOptions = {
  variant?: ToastVariant;
  /** Auto-dismiss duration in ms. Defaults to 3000. Ignored for
      variant: 'action' (those require user interaction). */
  duration?: number;
  /** Optional Material Symbols name to render as a leading icon. */
  icon?: string | null;
  /** For variant: 'action' — the secondary (left) button. */
  secondaryAction?: ToastAction;
  /** For variant: 'action' — the primary (right) button. */
  primaryAction?: ToastAction;
};

export type ToastApi = {
  show: (message: ReactNode, options?: ToastOptions) => string;
  success: (
    message: ReactNode,
    options?: Omit<ToastOptions, 'variant'>,
  ) => string;
  warning: (
    message: ReactNode,
    options?: Omit<ToastOptions, 'variant'>,
  ) => string;
  error: (
    message: ReactNode,
    options?: Omit<ToastOptions, 'variant'>,
  ) => string;
  dismiss: (id: string) => void;
};

type ToastEntry = {
  id: string;
  message: ReactNode;
  variant: ToastVariant;
  icon: string | null;
  state: 'enter' | 'exit';
  primaryAction?: ToastAction;
  secondaryAction?: ToastAction;
};

const ToastContext = createContext<ToastApi | null>(null);

const EXIT_ANIMATION_MS = 220;
const DEFAULT_DURATION_MS = 19_000;

let counter = 0;
function genId(): string {
  counter += 1;
  return `toast_${Date.now().toString(36)}_${counter}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  // Two timer maps — see the Modal-mounted-state comment for why
  // dismiss vs remove need separate cancellation tracks.
  const dismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const removeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    removeTimers.current.delete(id);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      const dt = dismissTimers.current.get(id);
      if (dt) {
        clearTimeout(dt);
        dismissTimers.current.delete(id);
      }
      // Already exiting? No-op (avoids double-scheduling remove).
      if (removeTimers.current.has(id)) return;

      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, state: 'exit' } : t)),
      );
      const rt = setTimeout(() => remove(id), EXIT_ANIMATION_MS);
      removeTimers.current.set(id, rt);
    },
    [remove],
  );

  const show = useCallback(
    (message: ReactNode, options?: ToastOptions): string => {
      const id = genId();
      const variant = options?.variant ?? 'default';
      const icon = options?.icon ?? null;

      setToasts((prev) => [
        ...prev,
        {
          id,
          message,
          variant,
          icon,
          state: 'enter',
          primaryAction: options?.primaryAction,
          secondaryAction: options?.secondaryAction,
        },
      ]);

      // Action toasts never auto-dismiss — user must click an
      // action (or call dismiss programmatically). Other variants
      // honour the duration (default 3s).
      if (variant !== 'action') {
        const duration = options?.duration ?? DEFAULT_DURATION_MS;
        const dt = setTimeout(() => dismiss(id), duration);
        dismissTimers.current.set(id, dt);
      }

      return id;
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(() => {
    return {
      show,
      dismiss,
      success: (message, options) =>
        show(message, { ...options, variant: 'success' }),
      warning: (message, options) =>
        show(message, { ...options, variant: 'warning' }),
      error: (message, options) =>
        show(message, { ...options, variant: 'error' }),
    };
  }, [show, dismiss]);

  useEffect(() => {
    const dts = dismissTimers.current;
    const rts = removeTimers.current;
    return () => {
      dts.forEach((t) => clearTimeout(t));
      rts.forEach((t) => clearTimeout(t));
      dts.clear();
      rts.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastPortal toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastPortal({
  toasts,
  onDismiss,
}: {
  toasts: ToastEntry[];
  onDismiss: (id: string) => void;
}) {
  if (typeof document === 'undefined') return null;
  if (toasts.length === 0) return null;
  return createPortal(
    <div
      className="ui-toast-stack"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastEntry;
  onDismiss: (id: string) => void;
}) {
  const isAction = toast.variant === 'action';

  const handleSecondary = () => {
    toast.secondaryAction?.onClick();
    onDismiss(toast.id);
  };
  const handlePrimary = () => {
    toast.primaryAction?.onClick();
    onDismiss(toast.id);
  };

  return (
    <div
      className={`ui-toast ui-toast--${toast.variant}`}
      data-state={toast.state}
    >
      <div className="ui-toast__row">
        {toast.icon && (
          <span className="ui-toast__icon material-symbols-rounded" aria-hidden>
            {toast.icon}
          </span>
        )}
        <span className="ui-toast__message">{toast.message}</span>
        {!isAction && (
          <button
            type="button"
            className="ui-toast__close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Stäng notis"
          >
            <span className="material-symbols-rounded" aria-hidden>
              close
            </span>
          </button>
        )}
      </div>
      {isAction && (toast.secondaryAction || toast.primaryAction) && (
        <div className="ui-toast__actions">
          {toast.secondaryAction && (
            <Button variant="secondary" size="sm" onClick={handleSecondary}>
              {toast.secondaryAction.label}
            </Button>
          )}
          {toast.primaryAction && (
            <Button variant="primary" size="sm" onClick={handlePrimary}>
              {toast.primaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast() must be used inside <ToastProvider>');
  }
  return ctx;
}
