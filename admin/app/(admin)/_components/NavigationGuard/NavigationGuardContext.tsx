"use client";

import {
  createContext,
  useContext,
  useCallback,
  useState,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

/* ── Types ── */

interface GuardCallbacks {
  /** Called when user picks "Save". Should publish then resolve true. */
  onSave: () => Promise<boolean>;
  /** Called when user picks "Discard". Should discard then resolve true. */
  onDiscard: () => Promise<boolean>;
}

interface NavigationGuardContextValue {
  /**
   * Navigate to href. If a guard is active, shows the unsaved-changes modal
   * instead of navigating immediately. The modal handles save/discard/cancel.
   */
  navigate: (href: string) => void;
  /**
   * Guard an arbitrary action (e.g. in-component state change).
   * If a guard is active, shows the modal. On save/discard the action runs.
   * If no guard is active, the action runs immediately.
   */
  guardAction: (action: () => void) => void;
  /** Register a guard (called by PublishBarProvider when hasUnsavedChanges). */
  registerGuard: (callbacks: GuardCallbacks) => void;
  /** Unregister the guard. */
  unregisterGuard: () => void;
  /** Whether a guard is currently active. */
  isGuarded: boolean;
}

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null);

export function useNavigationGuard(): NavigationGuardContextValue {
  const ctx = useContext(NavigationGuardContext);
  if (!ctx) throw new Error("useNavigationGuard must be used within NavigationGuardProvider");
  return ctx;
}

/* ── Modal state ── */

export interface UnsavedModalState {
  isOpen: boolean;
  pendingHref: string | null;
  isSaving: boolean;
  isDiscarding: boolean;
}

interface ModalContextValue {
  modal: UnsavedModalState;
  handleSave: () => void;
  handleDiscard: () => void;
  handleCancel: () => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

export function useUnsavedModal(): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error("useUnsavedModal must be used within NavigationGuardProvider");
  return ctx;
}

/* ── Provider ── */

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const guardRef = useRef<GuardCallbacks | null>(null);
  const [isGuarded, setIsGuarded] = useState(false);
  const [modal, setModal] = useState<UnsavedModalState>({
    isOpen: false,
    pendingHref: null,
    isSaving: false,
    isDiscarding: false,
  });
  const pendingHrefRef = useRef<string | null>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const registerGuard = useCallback((callbacks: GuardCallbacks) => {
    guardRef.current = callbacks;
    setIsGuarded(true);
  }, []);

  const unregisterGuard = useCallback(() => {
    guardRef.current = null;
    setIsGuarded(false);
  }, []);

  const navigate = useCallback((href: string) => {
    if (guardRef.current) {
      pendingHrefRef.current = href;
      pendingActionRef.current = null;
      setModal({ isOpen: true, pendingHref: href, isSaving: false, isDiscarding: false });
    } else {
      router.push(href);
    }
  }, [router]);

  const guardAction = useCallback((action: () => void) => {
    if (guardRef.current) {
      pendingHrefRef.current = null;
      pendingActionRef.current = action;
      setModal({ isOpen: true, pendingHref: null, isSaving: false, isDiscarding: false });
    } else {
      action();
    }
  }, []);

  const closeModal = useCallback(() => {
    pendingHrefRef.current = null;
    pendingActionRef.current = null;
    setModal({ isOpen: false, pendingHref: null, isSaving: false, isDiscarding: false });
  }, []);

  /** Run the pending navigation or action after save/discard completes */
  const executePending = useCallback(() => {
    const href = pendingHrefRef.current;
    const action = pendingActionRef.current;
    pendingHrefRef.current = null;
    pendingActionRef.current = null;
    if (href) {
      setTimeout(() => router.push(href), 50);
    } else if (action) {
      setTimeout(action, 50);
    }
  }, [router]);

  const handleSave = useCallback(async () => {
    if (!guardRef.current) return;
    setModal(prev => { if (prev.isSaving) return prev; return { ...prev, isSaving: true }; });
    const success = await guardRef.current.onSave();
    if (success) {
      closeModal();
      requestAnimationFrame(() => executePending());
    } else {
      setModal(prev => ({ ...prev, isSaving: false }));
    }
  }, [closeModal, executePending]);

  const handleDiscard = useCallback(async () => {
    const hasPending = pendingHrefRef.current || pendingActionRef.current;
    if (!hasPending) { closeModal(); return; }
    setModal(prev => { if (prev.isDiscarding) return prev; return { ...prev, isDiscarding: true }; });
    try { await guardRef.current?.onDiscard(); } catch { /* ignore */ }
    guardRef.current = null;
    setIsGuarded(false);
    closeModal();
    executePending();
  }, [closeModal, executePending]);

  const handleCancel = useCallback(() => {
    if (modal.isSaving || modal.isDiscarding) return;
    closeModal();
  }, [modal.isSaving, modal.isDiscarding, closeModal]);

  // Intercept browser popstate (back/forward) when guarded
  useEffect(() => {
    if (!isGuarded) return;

    // Push a sentinel entry so back button hits us first
    const sentinel = "__nav_guard__";
    window.history.pushState({ [sentinel]: true }, "");

    const onPopState = (e: PopStateEvent) => {
      if (guardRef.current) {
        // Re-push sentinel to stay on page, show modal
        window.history.pushState({ [sentinel]: true }, "");
        setModal({ isOpen: true, pendingHref: null, isSaving: false, isDiscarding: false });
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      // Clean up sentinel entry if still present
      if (window.history.state?.[sentinel]) {
        window.history.back();
      }
    };
  }, [isGuarded]);

  return (
    <NavigationGuardContext.Provider value={{ navigate, guardAction, registerGuard, unregisterGuard, isGuarded }}>
      <ModalContext.Provider value={{ modal, handleSave, handleDiscard, handleCancel }}>
        {children}
      </ModalContext.Provider>
    </NavigationGuardContext.Provider>
  );
}
