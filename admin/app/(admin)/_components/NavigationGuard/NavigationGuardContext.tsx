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
      // Guard active — show modal instead of navigating
      setModal({ isOpen: true, pendingHref: href, isSaving: false, isDiscarding: false });
    } else {
      router.push(href);
    }
  }, [router]);

  const closeModal = useCallback(() => {
    setModal({ isOpen: false, pendingHref: null, isSaving: false, isDiscarding: false });
  }, []);

  const handleSave = useCallback(async () => {
    if (!guardRef.current || modal.isSaving) return;
    setModal(prev => ({ ...prev, isSaving: true }));
    const success = await guardRef.current.onSave();
    if (success && modal.pendingHref) {
      const href = modal.pendingHref;
      closeModal();
      // Small delay so state settles before navigation
      requestAnimationFrame(() => router.push(href));
    } else {
      setModal(prev => ({ ...prev, isSaving: false }));
    }
  }, [modal.pendingHref, modal.isSaving, router, closeModal]);

  const handleDiscard = useCallback(async () => {
    if (!guardRef.current || modal.isDiscarding) return;
    setModal(prev => ({ ...prev, isDiscarding: true }));
    const success = await guardRef.current.onDiscard();
    if (success && modal.pendingHref) {
      const href = modal.pendingHref;
      closeModal();
      requestAnimationFrame(() => router.push(href));
    } else {
      setModal(prev => ({ ...prev, isDiscarding: false }));
    }
  }, [modal.pendingHref, modal.isDiscarding, router, closeModal]);

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
    <NavigationGuardContext.Provider value={{ navigate, registerGuard, unregisterGuard, isGuarded }}>
      <ModalContext.Provider value={{ modal, handleSave, handleDiscard, handleCancel }}>
        {children}
      </ModalContext.Provider>
    </NavigationGuardContext.Provider>
  );
}
