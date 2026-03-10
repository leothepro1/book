"use client";

/**
 * Editor State Context
 * ────────────────────
 * Manages all editor-specific UI state. This is separate from
 * PreviewProvider (which manages config/draft state) and
 * PublishBarProvider (which manages publish workflow).
 *
 * State ownership:
 *   EditorContext   → UI state (active rail, selected section, panel navigation)
 *   PreviewContext  → Data state (config, optimistic updates, iframe sync)
 *   PublishBar      → Workflow state (undo/redo, publish, dirty tracking)
 *
 * This context is intentionally NOT a reducer. The state graph is simple
 * enough that useState + callbacks is clearer than action dispatching.
 * If it grows past 5-6 fields, refactor to useReducer.
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

// ─── Types ──────────────────────────────────────────────────

/** Which icon is active in the left rail. */
export type RailTab = "sections" | "settings";

/**
 * Detail target — what the detail/config panel is editing.
 *
 * Supports the full hierarchy: section → block → element.
 * Each level adds specificity. Going "back" pops the deepest level.
 *
 * Examples:
 *   { sectionId: "sec_1" }                                      → editing section settings
 *   { sectionId: "sec_1", blockId: "blk_1" }                    → editing block settings
 *   { sectionId: "sec_1", blockId: "blk_1", elementId: "elm_1"} → editing element settings
 */
export type DetailTarget = {
  sectionId: string;
  blockId?: string;
  elementId?: string;
};

/** Editor context value exposed via useEditor(). */
export type EditorContextValue = {
  /** Active rail tab. Controls which panel is visible. */
  activeRail: RailTab;
  setActiveRail: (tab: RailTab) => void;

  /** ID of the currently selected section (for detail editing). null = list view. */
  selectedSectionId: string | null;
  selectSection: (id: string | null) => void;

  /** Current detail navigation target. null = list view. */
  detailTarget: DetailTarget | null;

  /** Navigate into a detail panel (section, block, or element). */
  openDetail: (target: DetailTarget) => void;

  /** Go back one level. Element → Block → Section → List. */
  goBack: () => void;

  /** Close detail panel entirely (back to list view). */
  closeDetail: () => void;
};

// ─── Context ────────────────────────────────────────────────

const EditorContext = createContext<EditorContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────

export function EditorProvider({ children }: { children: ReactNode }) {
  const [activeRail, setActiveRail] = useState<RailTab>("sections");
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);

  const selectSection = useCallback((id: string | null) => {
    setSelectedSectionId(id);
    if (id !== null) setActiveRail("sections");
  }, []);

  const handleSetActiveRail = useCallback((tab: RailTab) => {
    setActiveRail(tab);
    setSelectedSectionId(null);
    setDetailTarget(null);
  }, []);

  const openDetail = useCallback((target: DetailTarget) => {
    setDetailTarget(target);
    setSelectedSectionId(target.sectionId);
    setActiveRail("sections");
  }, []);

  const goBack = useCallback(() => {
    setDetailTarget(null);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailTarget(null);
    setSelectedSectionId(null);
  }, []);

  return (
    <EditorContext.Provider
      value={{
        activeRail,
        setActiveRail: handleSetActiveRail,
        selectedSectionId,
        selectSection,
        detailTarget,
        openDetail,
        goBack,
        closeDetail,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    throw new Error(
      "useEditor() must be used within an <EditorProvider>. " +
      "Wrap your editor component tree with <EditorProvider>."
    );
  }
  return ctx;
}
