"use client";

import {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useNavigationGuard } from "../NavigationGuard";

// ── Types ────────────────────────────────────────────────────────

export type BrandingSnapshot = {
  logoUrl: string | null;
  logoWidth: number;
  accentColor: string;
};

function snapshotsEqual(a: BrandingSnapshot, b: BrandingSnapshot): boolean {
  return (
    a.logoUrl === b.logoUrl &&
    a.logoWidth === b.logoWidth &&
    a.accentColor === b.accentColor
  );
}

// ── Public context (for form controls) ──────────────────────────

interface EmailBrandingContextValue {
  branding: BrandingSnapshot;
  /** Capture current state before making a change (for undo). */
  pushUndo: () => void;
  /** Update a single branding field. */
  updateBranding: <K extends keyof BrandingSnapshot>(
    field: K,
    value: BrandingSnapshot[K],
  ) => void;
  /** Replace the entire branding snapshot (e.g. after undo/redo). */
  setBranding: (snapshot: BrandingSnapshot) => void;
  hasUnsavedChanges: boolean;
}

const EmailBrandingCtx = createContext<EmailBrandingContextValue | null>(null);

export function useEmailBranding(): EmailBrandingContextValue {
  const ctx = useContext(EmailBrandingCtx);
  if (!ctx)
    throw new Error(
      "useEmailBranding must be used within EmailBrandingProvider",
    );
  return ctx;
}

// ── Internal context (for publish bar) ──────────────────────────

interface EmailBrandingInternalValue {
  undoStack: BrandingSnapshot[];
  redoStack: BrandingSnapshot[];
  isPublishing: boolean;
  isDiscarding: boolean;
  isLingeringAfterPublish: boolean;
  hasUnsavedChanges: boolean;
  publishError: string | null;
  handleUndo: () => void;
  handleRedo: () => void;
  handlePublish: () => Promise<void>;
  handleDiscard: () => void;
}

const EmailBrandingInternalCtx =
  createContext<EmailBrandingInternalValue | null>(null);

export function useEmailBrandingInternal(): EmailBrandingInternalValue {
  const ctx = useContext(EmailBrandingInternalCtx);
  if (!ctx)
    throw new Error(
      "useEmailBrandingInternal must be used within EmailBrandingProvider",
    );
  return ctx;
}

// ── Provider ────────────────────────────────────────────────────

interface EmailBrandingProviderProps {
  children: ReactNode;
  initialBranding: BrandingSnapshot;
}

export function EmailBrandingProvider({
  children,
  initialBranding,
}: EmailBrandingProviderProps) {
  const [branding, setBrandingState] =
    useState<BrandingSnapshot>(initialBranding);
  const [savedBranding, setSavedBranding] =
    useState<BrandingSnapshot>(initialBranding);

  const [undoStack, setUndoStack] = useState<BrandingSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<BrandingSnapshot[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [isLingeringAfterPublish, setIsLingeringAfterPublish] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const lingerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brandingRef = useRef(branding);

  const hasUnsavedChanges = !snapshotsEqual(branding, savedBranding);

  // Keep brandingRef in sync for use in callbacks
  useEffect(() => {
    brandingRef.current = branding;
  });

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (lingerTimer.current) clearTimeout(lingerTimer.current);
    };
  }, []);

  // ── Public API ──────────────────────────────────────────────

  const pushUndo = useCallback(() => {
    setBrandingState((current) => {
      setUndoStack((prev) => [...prev, current]);
      setRedoStack([]);
      return current; // no change to branding, just reading the value
    });
  }, []);

  const updateBranding = useCallback(
    <K extends keyof BrandingSnapshot>(
      field: K,
      value: BrandingSnapshot[K],
    ) => {
      setBrandingState((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const setBranding = useCallback((snapshot: BrandingSnapshot) => {
    setBrandingState(snapshot);
  }, []);

  // ── Undo / Redo ─────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];

    // Push current to redo — use functional setState to read latest branding
    setBrandingState((current) => {
      setRedoStack((prev) => [...prev, current]);
      return previous;
    });
    // Pop undo
    setUndoStack((prev) => prev.slice(0, -1));
  }, [undoStack]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];

    // Push current to undo — use functional setState to read latest branding
    setBrandingState((current) => {
      setUndoStack((prev) => [...prev, current]);
      return next;
    });
    // Pop redo
    setRedoStack((prev) => prev.slice(0, -1));
  }, [redoStack]);

  // ── Publish ─────────────────────────────────────────────────

  const handlePublish = useCallback(async () => {
    if (isPublishing) return;
    setIsPublishing(true);
    setPublishError(null);
    const startTime = Date.now();

    // Read the current branding synchronously before the await
    const current = brandingRef.current;

    try {
      const res = await fetch("/api/email-branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logoUrl: current.logoUrl,
          logoWidth: current.logoWidth,
          accentColor: current.accentColor,
        }),
      });

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 2000 - elapsed);
      await new Promise((resolve) => setTimeout(resolve, remaining));

      if (res.ok) {
        setSavedBranding({ ...current });
        setUndoStack([]);
        setRedoStack([]);
        setIsPublishing(false);
        setIsLingeringAfterPublish(true);
        if (lingerTimer.current) clearTimeout(lingerTimer.current);
        lingerTimer.current = setTimeout(() => {
          setIsLingeringAfterPublish(false);
        }, 1000);
      } else {
        const body = await res.json().catch(() => null);
        const msg = body?.error ?? "Kunde inte spara — försök igen";
        console.error("[EmailBranding] Publish failed:", res.status, msg);
        setPublishError(msg);
        setIsPublishing(false);
      }
    } catch (err) {
      console.error("[EmailBranding] Publish error:", err);
      setPublishError("Nätverksfel — försök igen");
      setIsPublishing(false);
    }
  }, [isPublishing]);

  const handleDiscard = useCallback(() => {
    setIsDiscarding(true);
    setTimeout(() => {
      setBrandingState(savedBranding);
      setUndoStack([]);
      setRedoStack([]);
      setPublishError(null);
      setIsDiscarding(false);
    }, 1000);
  }, [savedBranding]);

  // ── Warn on window close with unsaved changes ───────────────

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  // ── Navigation guard ────────────────────────────────────────

  const { registerGuard, unregisterGuard } = useNavigationGuard();
  const handlePublishRef = useRef(handlePublish);
  useEffect(() => {
    handlePublishRef.current = handlePublish;
  });

  useEffect(() => {
    if (hasUnsavedChanges) {
      registerGuard({
        onSave: async () => {
          await handlePublishRef.current();
          return true;
        },
        onDiscard: async () => {
          setBrandingState(savedBranding);
          setUndoStack([]);
          setRedoStack([]);
          return true;
        },
      });
    } else {
      unregisterGuard();
    }
  }, [hasUnsavedChanges, savedBranding, registerGuard, unregisterGuard]);

  return (
    <EmailBrandingCtx.Provider
      value={{
        branding,
        pushUndo,
        updateBranding,
        setBranding,
        hasUnsavedChanges,
      }}
    >
      <EmailBrandingInternalCtx.Provider
        value={{
          undoStack,
          redoStack,
          isPublishing,
          isDiscarding,
          isLingeringAfterPublish,
          hasUnsavedChanges,
          publishError,
          handleUndo,
          handleRedo,
          handlePublish,
          handleDiscard,
        }}
      >
        {children}
      </EmailBrandingInternalCtx.Provider>
    </EmailBrandingCtx.Provider>
  );
}
