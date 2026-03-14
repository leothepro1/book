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

interface PublishBarProviderProps {
  children: ReactNode;
  /** Supply current config so undo/redo can snapshot properly. */
  getConfig: () => TenantConfig | null;
}

export function PublishBarProvider({ children, getConfig }: PublishBarProviderProps) {
  const [undoStack, setUndoStack] = useState<DraftPatch[]>([]);
  const [redoStack, setRedoStack] = useState<DraftPatch[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);

  const pushUndo = useCallback((snapshot: DraftPatch) => {
    setUndoStack(prev => [...prev, snapshot]);
    setRedoStack([]);
    setHasUnsavedChanges(true);
  }, []);

  const markDirty = useCallback(() => {
    setHasUnsavedChanges(true);
  }, []);

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0 || isUndoing) return;
    setIsUndoing(true);

    const previousSnapshot = undoStack[undoStack.length - 1];
    const config = getConfig();
    if (config) {
      // Snapshot current state for redo — pick only the keys that the undo snapshot contains
      const redoSnapshot = pickKeys(config, previousSnapshot);
      setRedoStack(prev => [...prev, redoSnapshot]);
    }

    setUndoStack(prev => prev.slice(0, -1));
    await updateDraft(previousSnapshot);

    if (undoStack.length <= 1) {
      await discardDraft();
      setHasUnsavedChanges(false);
    }
    setIsUndoing(false);
  }, [undoStack, isUndoing, getConfig]);

  const handleRedo = useCallback(async () => {
    if (redoStack.length === 0 || isUndoing) return;
    setIsUndoing(true);

    const redoSnapshot = redoStack[redoStack.length - 1];
    const config = getConfig();
    if (config) {
      const undoSnapshot = pickKeys(config, redoSnapshot);
      setUndoStack(prev => [...prev, undoSnapshot]);
    }

    setRedoStack(prev => prev.slice(0, -1));
    await updateDraft(redoSnapshot);
    setHasUnsavedChanges(true);
    setIsUndoing(false);
  }, [redoStack, isUndoing, getConfig]);

  const [isLingeringAfterPublish, setIsLingeringAfterPublish] = useState(false);
  const lingerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
