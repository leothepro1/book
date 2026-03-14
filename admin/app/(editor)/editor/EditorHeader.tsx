"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigationGuard } from "@/app/(admin)/_components/NavigationGuard/NavigationGuardContext";
import { usePublishBar } from "@/app/(admin)/_components/PublishBar/PublishBarContext";
import { usePreview } from "@/app/(admin)/_components/GuestPreview";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { useEditor } from "./EditorContext";
import { getEditorPages } from "@/app/_lib/pages/config";
import { getPageDefinition } from "@/app/_lib/pages/registry";
import type { PageId } from "@/app/_lib/pages/types";
import { EditorPublishBar } from "./EditorPublishBar";

/**
 * Lightweight theme name lookup — avoids depending on the async theme registry.
 * Maps themeId → display name. Add entries here when new themes are created.
 */
const THEME_NAMES: Record<string, string> = {
  classic: "Classic",
  immersive: "Pebble",
};

/**
 * Editor header bar.
 *
 * Full-width top bar with:
 *   - Back navigation (left) — guarded when unsaved changes exist
 *   - Title with hover slide animation (Editor → Avsluta)
 *   - Status badge (Live / Osparad)
 *   - More menu (theme info + actions)
 *   - Spacer
 *   - Page switcher (center)
 *   - Undo / Redo / Publish controls (right, always visible)
 */
export function EditorHeader() {
  const { navigate } = useNavigationGuard();
  const { hasUnsavedChanges } = usePublishBar();

  const handleBack = () => navigate("/home");

  return (
    <header className="editor-header">
      <div className="editor-header__nav">
        <button
          type="button"
          onClick={handleBack}
          className="editor-header__back"
          aria-label="Avsluta editor"
        >
          <EditorIcon name="logout" size={20} style={{ transform: "rotate(180deg)" }} />
        </button>
        <span className="editor-header__label">
          <span className="editor-header__label-text editor-header__label-text--default">Editor</span>
          <span className="editor-header__label-text editor-header__label-text--hover">Avsluta</span>
        </span>
        <span className={`editor-header__status ${hasUnsavedChanges ? "editor-header__status--unsaved" : "editor-header__status--live"}`}>
          <span className="editor-header__status-dot" />
          {hasUnsavedChanges ? "Osparad" : "Live"}
        </span>
        <HeaderMoreMenu />
      </div>

      <div className="editor-header__spacer" />

      <PageSwitcher />

      <div className="editor-header__spacer" />

      <EditorPublishBar />
    </header>
  );
}

// ─── Page Switcher ────────────────────────────────────────────

function PageSwitcher() {
  const [open, setOpen] = useState(false);
  const [submenuPageId, setSubmenuPageId] = useState<PageId | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { currentPageId, setCurrentPageId } = useEditor();

  const pages = useMemo(() => getEditorPages(), []);
  const currentDef = getPageDefinition(currentPageId);
  const currentLabel = currentDef.label;

  const submenuDef = submenuPageId ? getPageDefinition(submenuPageId) : null;

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSubmenuPageId(null);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const handleSelect = (pageId: PageId) => {
    setCurrentPageId(pageId);
    setOpen(false);
    setSubmenuPageId(null);
  };

  const handleClose = () => {
    setOpen(false);
    setSubmenuPageId(null);
  };

  return (
    <div className="sf-dropdown editor-header__page-switcher" ref={ref}>
      <button
        type="button"
        className="editor-header__page-trigger"
        onClick={() => { setOpen(!open); setSubmenuPageId(null); }}
      >
        <EditorIcon name={currentDef.icon} size={18} className="editor-header__page-icon" />
        <span>{currentLabel}</span>
        <EditorIcon name="keyboard_arrow_down" size={20} className="editor-header__page-chevron" />
      </button>
      {open && (
        <ul className="sf-dropdown__menu editor-header__page-menu">
          {submenuDef && submenuDef.steps ? (
            <>
              <li
                className="sf-dropdown__item sf-dropdown__item--back"
                onClick={() => setSubmenuPageId(null)}
              >
                <EditorIcon name="chevron_left" size={18} />
                <span style={{ flex: 1, fontWeight: 500 }}>{submenuDef.label}</span>
              </li>
              <li className="sf-dropdown__divider" />
              {submenuDef.steps.map((step) => (
                <li
                  key={step.id}
                  className="sf-dropdown__item"
                  onClick={() => handleClose()}
                >
                  <EditorIcon name={step.icon} size={18} className="editor-header__page-icon" />
                  <span style={{ flex: 1 }}>{step.label}</span>
                </li>
              ))}
            </>
          ) : (
            pages.map((page) => {
              const hasSteps = page.steps && page.steps.length > 0;
              return (
                <li
                  key={page.id}
                  className={`sf-dropdown__item${page.id === currentPageId ? " sf-dropdown__item--active" : ""}`}
                  onClick={() => hasSteps ? setSubmenuPageId(page.id) : handleSelect(page.id)}
                >
                  <EditorIcon name={page.icon} size={18} className="editor-header__page-icon" />
                  <span style={{ flex: 1 }}>{page.label}</span>
                  {hasSteps && (
                    <EditorIcon name="chevron_right" size={18} className="editor-header__page-icon" />
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

// ─── More Menu ────────────────────────────────────────────────

function HeaderMoreMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { config } = usePreview();

  const themeId = config?.themeId;
  const themeName = themeId ? (THEME_NAMES[themeId] ?? themeId) : "Inget tema";
  const version = config?.themeVersion ?? "—";

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div className="sf-dropdown editor-header__more" ref={ref}>
      <button
        type="button"
        className="dp-header__menu"
        aria-label="Fler alternativ"
        onClick={() => setOpen(!open)}
      >
        <MoreIcon />
      </button>
      {open && (
        <div className="sf-dropdown__menu editor-header__more-menu">
          <div className="editor-header__more-title">
            <span className="editor-header__more-theme">{themeName}</span>
            {" "}
            <span className="editor-header__more-version">{version}</span>
          </div>
          <div className="editor-header__more-divider" />
          <ul className="editor-header__more-list">
            <li className="sf-dropdown__item" onClick={() => setOpen(false)}>
              <a
                href={`${window.location.origin}/p/test`}
                target="_blank"
                rel="noopener noreferrer"
                className="editor-header__more-link"
              >
                <EditorIcon name="visibility" size={18} />
                <span>Visa</span>
              </a>
            </li>
            <li className="sf-dropdown__item" onClick={() => setOpen(false)}>
              <a
                href=""
                target="_blank"
                rel="noopener noreferrer"
                className="editor-header__more-link"
              >
                <EditorIcon name="assignment" size={18} />
                <span>Visa dokumentation</span>
              </a>
            </li>
            <li className="sf-dropdown__item" onClick={() => setOpen(false)}>
              <a
                href=""
                target="_blank"
                rel="noopener noreferrer"
                className="editor-header__more-link"
              >
                <EditorIcon name="help" size={18} />
                <span>Få support</span>
              </a>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

function MoreIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4 8a1.5 1.5 0 1 1-3.001-.001 1.5 1.5 0 0 1 3.001.001" />
      <path d="M9.5 8a1.5 1.5 0 1 1-3.001-.001 1.5 1.5 0 0 1 3.001.001" />
      <path d="M13.5 9.5a1.5 1.5 0 1 0-.001-3.001 1.5 1.5 0 0 0 .001 3.001" />
    </svg>
  );
}
