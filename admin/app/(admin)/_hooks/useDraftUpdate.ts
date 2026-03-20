"use client";

import { useCallback, useRef, useEffect } from "react";
import { usePreview } from "../_components/GuestPreview";
import { updateDraft, type DraftPatch } from "../_lib/tenant/updateDraft";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import merge from "deepmerge";

/**
 * Debounced draft persist — editor performance optimization
 * ══════════════════════════════════════════════════════════
 *
 * Pipeline (per keystroke):
 *   1. updateConfig() → instant optimistic state update
 *   2. Changes coalesced into pending batch
 *   3. After PERSIST_DEBOUNCE_MS of inactivity → updateDraft() → DB persist
 *   4. notifyDraftSaved() → iframe content-refresh
 *
 * This turns N rapid keystrokes into 1 DB write + 1 iframe refresh,
 * keeping inputs responsive while the preview stays in sync.
 *
 * Module-level state is safe because only one editor session runs at a time.
 */

const PERSIST_DEBOUNCE_MS = 300;

const overwriteArrays: merge.Options["arrayMerge"] = (_target, source) => source;

// ── Module-level debounce state ──────────────────────────

let _timer: ReturnType<typeof setTimeout> | null = null;
let _pending: DraftPatch | null = null;
let _flushImpl: (() => Promise<void>) | null = null;

/**
 * Cancel pending debounced draft persist.
 * Call before undo/redo/discard to prevent stale writes.
 */
export function cancelPendingDraft() {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  _pending = null;
}

/**
 * Immediately persist any pending debounced changes.
 * Call before publish to ensure DB has the latest state.
 */
export async function flushPendingDraft() {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  if (_pending && _flushImpl) await _flushImpl();
}

/**
 * Hook that combines updateDraft (server persist) with optimistic preview updates.
 *
 * Pipeline:
 *  1. Snapshot current config (for rollback on failure — first change in burst only)
 *  2. updateConfig() → optimistic state update → instant CSS in iframe
 *  3. Coalesce changes into pending batch
 *  4. After debounce → updateDraft() → persist to DB
 *  5. notifyDraftSaved() → router.refresh() in iframe for content
 *
 * If the server persist fails, the optimistic update is rolled back
 * to the pre-burst snapshot to prevent preview/DB divergence.
 */
export function useDraftUpdate() {
  const { config, updateConfig, notifyDraftSaved } = usePreview();
  const configRef = useRef(config);
  configRef.current = config;

  // Stable refs to avoid stale closures in flush
  const updateConfigRef = useRef(updateConfig);
  updateConfigRef.current = updateConfig;
  const notifyRef = useRef(notifyDraftSaved);
  notifyRef.current = notifyDraftSaved;

  // Rollback snapshot — captured on first change in a burst
  const snapshotRef = useRef<TenantConfig | null>(null);

  const flush = useCallback(async () => {
    const changes = _pending;
    const snapshot = snapshotRef.current;
    _pending = null;
    _timer = null;
    snapshotRef.current = null;

    if (!changes) return;

    const result = await updateDraft(changes);
    if (result.success) {
      notifyRef.current();
    } else {
      // Rollback optimistic update to pre-burst state
      if (snapshot) {
        updateConfigRef.current(snapshot);
      }
      if (process.env.NODE_ENV === "development") {
        console.warn("[useDraftUpdate] Persist failed, rolled back:", result.error);
      }
    }
  }, []);

  // Register flush for external callers (flushPendingDraft)
  useEffect(() => {
    _flushImpl = flush;
    return () => {
      _flushImpl = null;
      cancelPendingDraft();
    };
  }, [flush]);

  return useCallback(
    (changes: DraftPatch): Promise<{ success: boolean; error?: string }> => {
      // Capture rollback snapshot (only first change in a burst)
      if (!snapshotRef.current) {
        snapshotRef.current = configRef.current;
      }

      // 1. Optimistic update — instant, keeps inputs responsive
      updateConfigRef.current(changes);

      // 2. Coalesce with pending changes
      _pending = _pending
        ? merge(_pending as Record<string, unknown>, changes as Record<string, unknown>, {
            arrayMerge: overwriteArrays,
          }) as DraftPatch
        : changes;

      // 3. Debounce DB persist + iframe refresh
      if (_timer) clearTimeout(_timer);
      _timer = setTimeout(flush, PERSIST_DEBOUNCE_MS);

      // Return optimistic success — real persist happens after debounce
      return Promise.resolve({ success: true });
    },
    [flush],
  );
}
