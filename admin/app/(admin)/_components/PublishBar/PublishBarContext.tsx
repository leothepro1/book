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
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import { updateDraft, type DraftPatch } from "../../_lib/tenant/updateDraft";
import { publishDraft, discardDraft } from "../../_lib/tenant/publishDraft";
import { hasDraftChanges } from "../../_lib/tenant/getDraftDiff";
import { usePreview } from "../GuestPreview/PreviewContext";
import { useNavigationGuard } from "../NavigationGuard";

/**
 * Pick keys from `source` that exist in `template`.
 * Used to create symmetrical undo/redo snapshots without `as any`.
 */
function pickKeys(
  source: TenantConfig,
  template: DraftPatch,
): DraftPatch {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(template)) {
    result[key] = source[key as keyof TenantConfig];
  }
  return result as DraftPatch;
}

/* ── Context value ── */

interface PublishBarContextValue {
  /** Push a snapshot before making a change (for undo). */
  pushUndo: (snapshot: DraftPatch) => void;
  /** Whether there are unsaved (unpublished) changes. */
  hasUnsavedChanges: boolean;
  /** Mark changes as present without pushing undo (e.g. after external mutation). */
  markDirty: () => void;
}

const PublishBarContext = createContext<PublishBarContextValue | null>(null);

/* ── Hook ── */

export function usePublishBar(): PublishBarContextValue {
  const ctx = useContext(PublishBarContext);
  if (!ctx) throw new Error("usePublishBar must be used within PublishBarProvider");
  return ctx;
}

/* ── Internal context for the bar UI ── */

interface PublishBarInternalValue {
  undoStack: DraftPatch[];
  redoStack: DraftPatch[];
  isUndoing: boolean;
  isPublishing: boolean;
  isLingeringAfterPublish: boolean;
  hasUnsavedChanges: boolean;
  handleUndo: () => Promise<void>;
  handleRedo: () => Promise<void>;
  handlePublish: () => Promise<void>;
}

const PublishBarInternalContext = createContext<PublishBarInternalValue | null>(null);

export function usePublishBarInternal(): PublishBarInternalValue {
  const ctx = useContext(PublishBarInternalContext);
  if (!ctx) throw new Error("usePublishBarInternal must be used within PublishBarProvider");
  return ctx;
}

/* ── Provider ── */

const DIFF_DEBOUNCE_MS = 500;

export function PublishBarProvider({ children }: { children: ReactNode }) {
  const { config, updateConfig, notifyDraftSaved } = usePreview();

  const [undoStack, setUndoStack] = useState<DraftPatch[]>([]);
  const [redoStack, setRedoStack] = useState<DraftPatch[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isLingeringAfterPublish, setIsLingeringAfterPublish] = useState(false);

  const configRef = useRef(config);
  configRef.current = config;
  const diffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lingerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check for draft changes on mount — show publish bar if existing draft differs from live
  useEffect(() => {
    hasDraftChanges().then(setHasUnsavedChanges);
  }, []);

  // Debounced server diff check — called after every draft mutation
  const checkDraftDiff = useCallback(() => {
    if (diffTimerRef.current) clearTimeout(diffTimerRef.current);
    diffTimerRef.current = setTimeout(() => {
      hasDraftChanges().then(setHasUnsavedChanges);
    }, DIFF_DEBOUNCE_MS);
  }, []);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (diffTimerRef.current) clearTimeout(diffTimerRef.current);
      if (lingerTimer.current) clearTimeout(lingerTimer.current);
    };
  }, []);

  const pushUndo = useCallback((snapshot: DraftPatch) => {
    setUndoStack(prev => [...prev, snapshot]);
    setRedoStack([]);
    // Optimistically show dirty, then verify with server
    setHasUnsavedChanges(true);
    checkDraftDiff();
  }, [checkDraftDiff]);

  const markDirty = useCallback(() => {
    setHasUnsavedChanges(true);
    checkDraftDiff();
  }, [checkDraftDiff]);

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0 || isUndoing) return;
    setIsUndoing(true);

    const previousSnapshot = undoStack[undoStack.length - 1];
    const currentConfig = configRef.current;
    if (currentConfig) {
      const redoSnapshot = pickKeys(currentConfig, previousSnapshot);
      setRedoStack(prev => [...prev, redoSnapshot]);
    }

    setUndoStack(prev => prev.slice(0, -1));

    // Apply undo: update local state + persist to DB
    updateConfig(previousSnapshot);
    await updateDraft(previousSnapshot);
    notifyDraftSaved();

    setIsUndoing(false);

    // Recompute dirty state from server truth
    checkDraftDiff();
  }, [undoStack, isUndoing, updateConfig, notifyDraftSaved, checkDraftDiff]);

  const handleRedo = useCallback(async () => {
    if (redoStack.length === 0 || isUndoing) return;
    setIsUndoing(true);

    const redoSnapshot = redoStack[redoStack.length - 1];
    const currentConfig = configRef.current;
    if (currentConfig) {
      const undoSnapshot = pickKeys(currentConfig, redoSnapshot);
      setUndoStack(prev => [...prev, undoSnapshot]);
    }

    setRedoStack(prev => prev.slice(0, -1));

    // Apply redo: update local state + persist to DB
    updateConfig(redoSnapshot);
    await updateDraft(redoSnapshot);
    notifyDraftSaved();

    setIsUndoing(false);

    // Recompute dirty state from server truth
    checkDraftDiff();
  }, [redoStack, isUndoing, updateConfig, notifyDraftSaved, checkDraftDiff]);

  const handlePublish = useCallback(async () => {
    if (isPublishing) return;
    setIsPublishing(true);
    const startTime = Date.now();
    const result = await publishDraft();
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, 2000 - elapsed);
    await new Promise(resolve => setTimeout(resolve, remaining));
    if (result.success) {
      setUndoStack([]);
      setRedoStack([]);
      setIsPublishing(false);
      setIsLingeringAfterPublish(true);
      if (lingerTimer.current) clearTimeout(lingerTimer.current);
      lingerTimer.current = setTimeout(() => {
        setIsLingeringAfterPublish(false);
        setHasUnsavedChanges(false);
      }, 1000);
    } else {
      console.error("[Publish] Failed:", result.error);
      setIsPublishing(false);
    }
  }, [isPublishing]);

  // Warn on window close with unsaved changes
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  // Register/unregister navigation guard
  const { registerGuard, unregisterGuard } = useNavigationGuard();
  const handlePublishRef = useRef(handlePublish);
  handlePublishRef.current = handlePublish;

  useEffect(() => {
    if (hasUnsavedChanges) {
      registerGuard({
        onSave: async () => {
          await handlePublishRef.current();
          return true;
        },
        onDiscard: async () => {
          await discardDraft();
          setUndoStack([]);
          setRedoStack([]);
          setHasUnsavedChanges(false);
          return true;
        },
      });
    } else {
      unregisterGuard();
    }
  }, [hasUnsavedChanges, registerGuard, unregisterGuard]);

  return (
    <PublishBarContext.Provider value={{ pushUndo, hasUnsavedChanges, markDirty }}>
      <PublishBarInternalContext.Provider
        value={{
          undoStack,
          redoStack,
          isUndoing,
          isPublishing,
          isLingeringAfterPublish,
          hasUnsavedChanges,
          handleUndo,
          handleRedo,
          handlePublish,
        }}
      >
        {children}
      </PublishBarInternalContext.Provider>
    </PublishBarContext.Provider>
  );
}
