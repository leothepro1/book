"use client";

import { useCallback } from "react";
import { usePreview } from "../_components/GuestPreview";
import { updateDraft } from "../_lib/tenant/updateDraft";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";

/**
 * Hook that combines updateDraft (server persist) with optimistic preview updates.
 *
 * Usage:
 *   const saveDraft = useDraftUpdate();
 *   // Inside a transition:
 *   await saveDraft({ theme: { colors: { background: '#fff' } } });
 *
 * This automatically:
 *  1. Calls updateConfig() → optimistic state update → triggers instant CSS in iframe
 *  2. Calls updateDraft() → persists to DB
 *  3. Calls notifyDraftSaved() → triggers router.refresh() in iframe for content
 */
export function useDraftUpdate() {
  const { updateConfig, notifyDraftSaved } = usePreview();

  return useCallback(
    async (changes: Partial<TenantConfig>): Promise<{ success: boolean; error?: string }> => {
      // 1. Optimistic update → instant theme preview via postMessage
      updateConfig(changes);

      // 2. Persist to DB
      const result = await updateDraft(changes);

      // 3. Signal content refresh in iframe (router.refresh)
      if (result.success) {
        notifyDraftSaved();
      }

      return result;
    },
    [updateConfig, notifyDraftSaved],
  );
}
