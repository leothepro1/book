"use client";

/**
 * Editor State Context
 * ────────────────────
 * Manages all editor-specific UI state. This is separate from
 * PreviewProvider (which manages config/draft state) and
 * PublishBarProvider (which manages publish workflow).
 *
 * State ownership:
 *   EditorContext   → UI state (active rail, selected section, panel navigation, inspector)
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
import type { PageId } from "@/app/_lib/pages/types";
import { getPageDefinition, isPageId } from "@/app/_lib/pages/registry";

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
  /** Scope discriminator. undefined = body section (backward-compatible). */
  scope?: "header" | "footer" | "footer-classic-block" | "footer-classic-element";
  sectionId: string;
  blockId?: string;
  elementId?: string;
};

/** Preview viewport mode — controls preview frame size in canvas. */
export type ViewportMode = "mobile" | "desktop";

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

  /**
   * Deep-link hint for SettingsPanel.
   * When set, SettingsPanel opens the named accordion on mount.
   * Consumed once (reset after read).
   */
  settingsAccordion: string | null;

  /** Navigate to settings panel, optionally opening a specific accordion. */
  navigateToSettings: (accordion?: string) => void;

  /** Which page the editor is currently editing. Default "home". */
  currentPageId: PageId;
  setCurrentPageId: (pageId: PageId) => void;

  /** Whether the section inspector overlay is active in the preview iframe. */
  inspectorActive: boolean;
  setInspectorActive: (active: boolean) => void;

  /** Section ID currently hovered via inspector (for sp-row highlight sync). null = none. */
  inspectorHoveredSectionId: string | null;
  setInspectorHoveredSectionId: (id: string | null) => void;

  /** Active step within a multi-step page (e.g. check-in flow). null = default/main. */
  activeStepId: string | null;
  setActiveStepId: (stepId: string | null) => void;

  /** Preview viewport mode — "mobile" (phone frame) or "desktop" (wide frame). */
  viewportMode: ViewportMode;
  setViewportMode: (mode: ViewportMode) => void;
};

// ─── Context ────────────────────────────────────────────────

const EditorContext = createContext<EditorContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────

export function EditorProvider({ children }: { children: ReactNode }) {
  const [activeRail, setActiveRail] = useState<RailTab>("sections");
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [settingsAccordion, setSettingsAccordion] = useState<string | null>(null);
  const [currentPageId, setCurrentPageIdRaw] = useState<PageId>(() => {
    if (typeof window === "undefined") return "home";
    const segments = window.location.pathname.split("/");
    // URL pattern: /editor/{pageId}
    const slug = segments[2];
    if (slug && isPageId(slug)) return slug;
    return "home";
  });
  const [inspectorActive, setInspectorActive] = useState(false);
  const [inspectorHoveredSectionId, setInspectorHoveredSectionId] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [viewportMode, setViewportMode] = useState<ViewportMode>("desktop");

  const selectSection = useCallback((id: string | null) => {
    setSelectedSectionId(id);
    if (id !== null) setActiveRail("sections");
  }, []);

  const handleSetActiveRail = useCallback((tab: RailTab) => {
    setActiveRail(tab);
    setSelectedSectionId(null);
    setDetailTarget(null);
    setSettingsAccordion(null);
  }, []);

  const openDetail = useCallback((target: DetailTarget) => {
    setDetailTarget(target);
    setSelectedSectionId(target.sectionId);
    setActiveRail("sections");
    setInspectorHoveredSectionId(null);
  }, []);

  const goBack = useCallback(() => {
    setDetailTarget(null);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailTarget(null);
    setSelectedSectionId(null);
  }, []);

  /**
   * Switch the editor to a different page.
   * Resets ALL editor state that would be unsafe to carry across pages:
   *   - detail target (section/block/element selection)
   *   - selected section ID
   *   - settings accordion hint
   *   - inspector hover state
   *   - active rail returns to sections
   */
  const handleSetCurrentPageId = useCallback((pageId: PageId) => {
    setCurrentPageIdRaw(pageId);
    const def = getPageDefinition(pageId);
    setActiveRail(def.editorMode === "settings" ? "settings" : "sections");
    setSelectedSectionId(null);
    setDetailTarget(null);
    setSettingsAccordion(null);
    setInspectorHoveredSectionId(null);
    setActiveStepId(null);

    // Sync URL — replaceState keeps browser history clean (no back-spam)
    const url = pageId === "home" ? "/editor" : `/editor/${pageId}`;
    window.history.replaceState(null, "", url);
  }, []);

  const navigateToSettings = useCallback((accordion?: string) => {
    setActiveRail("settings");
    setSelectedSectionId(null);
    setDetailTarget(null);
    setSettingsAccordion(accordion ?? null);
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
        settingsAccordion,
        navigateToSettings,
        currentPageId,
        setCurrentPageId: handleSetCurrentPageId,
        inspectorActive,
        setInspectorActive,
        inspectorHoveredSectionId,
        setInspectorHoveredSectionId,
        activeStepId,
        setActiveStepId,
        viewportMode,
        setViewportMode,
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
