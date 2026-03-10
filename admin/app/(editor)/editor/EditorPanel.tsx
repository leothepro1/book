"use client";

import { useEditor } from "./EditorContext";
import { SectionsPanel } from "./panels/SectionsPanel";
import { SettingsPanel } from "./panels/SettingsPanel";

/**
 * Side panel (column 2).
 *
 * Dispatches to the correct panel component based on the active rail tab.
 * Each panel manages its own internal navigation (list → detail → etc.).
 *
 * Panel components receive no props — they read context directly.
 * This keeps the dispatch layer thin and avoids prop drilling.
 */
export function EditorPanel() {
  const { activeRail } = useEditor();

  return (
    <aside className="editor-panel" role="region" aria-label={activeRail === "sections" ? "Sektioner" : "Inställningar"}>
      {activeRail === "sections" && <SectionsPanel />}
      {activeRail === "settings" && <SettingsPanel />}
    </aside>
  );
}
