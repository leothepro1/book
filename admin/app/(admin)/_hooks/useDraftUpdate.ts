"use client";

import { useCallback, useRef } from "react";
import { usePreview } from "../_components/GuestPreview";
import { updateDraft } from "../_lib/tenant/updateDraft";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";

/**
 * Hook that combines updateDraft (server persist) with optimistic preview updates.
 *
 * Pipeline:
 *  1. Snapshot current config (for rollback on failure)
 *  2. updateConfig() → optimistic state update → instant CSS in iframe
 *  3. updateDraft() → persist to DB
 *  4. notifyDraftSaved() → router.refresh() in iframe for content
 *
 * If the server persist fails, the optimistic update is rolled back
 * to prevent preview/DB divergence.
 */
export function useDraftUpdate() {
  const { config, updateConfig, notifyDraftSaved } = usePreview();
  const configRef = useRef(config);
  configRef.current = config;

  return useCallback(
    async (changes: Partial<TenantConfig>): Promise<{ success: boolean; error?: string }> => {
      // Snapshot for rollback
      const snapshot = configRef.current;

      // 1. Optimistic update → instant theme preview via postMessage
      updateConfig(changes);

      // 2. Persist to DB
      const result = await updateDraft(changes);

      if (result.success) {
        // 3. Signal content refresh in iframe (router.refresh)
        notifyDraftSaved();
      } else {
        // Rollback: restore previous config to prevent preview/DB divergence
        if (snapshot) {
          updateConfig(snapshot);
        }
        if (process.env.NODE_ENV === "development") {
          console.warn("[useDraftUpdate] Persist failed, rolled back optimistic update:", result.error);
        }
      }

      return result;
    },
    [updateConfig, notifyDraftSaved],
  );
}
