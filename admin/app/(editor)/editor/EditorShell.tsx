"use client";

/**
 * Editor Shell — Layout Grid
 * ──────────────────────────
 * Pure layout component. No state, no logic.
 * Composes the four structural regions of the editor:
 *
 *   ┌──────────────────────────────────────────┐
 *   │              EditorHeader                │
 *   ├──────┬────────────────┬──────────────────┤
 *   │ Rail │     Panel      │     Canvas       │
 *   │3.25r │   18.75rem     │      1fr         │
 *   └──────┴────────────────┴──────────────────┘
 */

import { EditorHeader } from "./EditorHeader";
import { EditorPanel } from "./EditorPanel";
import { EditorCanvas } from "./EditorCanvas";

export function EditorShell() {
  return (
    <div className="editor">
      <EditorHeader />
      <div className="editor-body">
        <EditorPanel />
        <EditorCanvas />
      </div>
    </div>
  );
}
