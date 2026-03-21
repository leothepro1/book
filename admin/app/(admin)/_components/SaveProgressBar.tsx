"use client";

/**
 * Save Progress Bar — Global draft save indicator
 * ═══════════════════════════════════════════════
 * Thin accent-colored bar at the bottom edge of the editor header.
 * Directly coupled to the draft save lifecycle via module-level
 * pub/sub in useDraftUpdate.ts — no manual binding per feature.
 *
 * Phases:
 *   idle       → hidden (width: 0)
 *   debouncing → 20% (changes queued, waiting for pause)
 *   persisting → 60% → 90% (DB write in flight)
 *   done       → 100% (complete, fades out)
 */

import { useSyncExternalStore } from "react";
import {
  subscribeSaveState,
  getSaveSnapshot,
} from "../_hooks/useDraftUpdate";

export function SaveProgressBar() {
  const { phase, progress } = useSyncExternalStore(
    subscribeSaveState,
    getSaveSnapshot,
    getSaveSnapshot,
  );

  const visible = phase !== "idle";

  return (
    <div
      className="save-progress"
      style={{
        opacity: visible ? 1 : 0,
        transition: phase === "done"
          ? "opacity 0.3s ease 0.15s"
          : "opacity 0.15s ease",
      }}
    >
      <div
        className="save-progress__bar"
        style={{
          width: `${progress}%`,
          transition: phase === "done"
            ? "width 0.2s ease"
            : phase === "persisting"
              ? "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)"
              : "width 0.15s ease",
        }}
      />
    </div>
  );
}
