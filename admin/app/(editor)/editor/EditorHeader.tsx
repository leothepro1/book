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
import { SaveProgressBar } from "@/app/(admin)/_components/SaveProgressBar";
import { Tooltip } from "@/app/_components/Tooltip";
import type { RailTab } from "./EditorContext";

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
      <SaveProgressBar />
      <div className="editor-header__nav">
        <Tooltip label="Lämna" placement="bottom">
          <button
            type="button"
            onClick={handleBack}
            className="editor-header__back"
            aria-label="Lämna"
          >
            <EditorIcon name="logout" size={18} style={{ transform: "rotate(180deg)" }} />
          </button>
        </Tooltip>
        <HeaderRailButtons />
      </div>

      <div className="editor-header__spacer" />

      <div className="editor-header__center">
        <EditorStatusTrigger />
        <PageSwitcher />
      </div>

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
  const { currentPageId, setCurrentPageId, setActiveStepId, activeStepId } = useEditor();

  const pages = useMemo(() => getEditorPages(), []);
  const currentDef = getPageDefinition(currentPageId);
  const activeStep = activeStepId ? currentDef.steps?.find((s) => s.id === activeStepId) : null;
  const currentLabel = activeStep?.label ?? currentDef.label;
  const currentIcon = activeStep?.icon ?? currentDef.icon;

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

  const handleStepClick = (stepId: string) => {
    setActiveStepId(stepId);
    const iframe = document.querySelector<HTMLIFrameElement>(".admin-preview iframe, .preview-widget iframe");
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: "checkin-step", stepId }, window.location.origin);
    }
    handleClose();
  };

  return (
    <div className="sf-dropdown editor-header__page-switcher" ref={ref}>
      <button
        type="button"
        className="editor-header__page-trigger"
        onClick={() => { setOpen(!open); setSubmenuPageId(null); }}
      >
        <EditorIcon name={currentIcon} size={18} className="editor-header__page-icon" />
        <span>{currentLabel}</span>
        <EditorIcon name="keyboard_arrow_down" size={20} className="editor-header__page-chevron" />
      </button>
      {open && (
        <ul className="sf-dropdown__menu editor-header__page-menu">
          {/* If current page has steps, show them as a group at the top */}
          {currentDef.steps && currentDef.steps.length > 0 && (
            <>
              <li className="sf-dropdown__item--group-label">
                {currentDef.label}
              </li>
              {currentDef.steps.map((step) => (
                <li
                  key={step.id}
                  className="sf-dropdown__item"
                  onClick={() => handleStepClick(step.id)}
                >
                  <EditorIcon name={step.icon} size={18} className="editor-header__page-icon" />
                  <span style={{ flex: 1 }}>{step.label}</span>
                </li>
              ))}
              <li className="sf-dropdown__divider" />
            </>
          )}
          {currentDef.editorMode === "settings" ? (
            <>
              {/* ── Kassa ──────────────────────────── */}
              <li className="sf-dropdown__item--group-label">Kassa</li>
              <li
                className={`sf-dropdown__item${currentPageId === "checkout" ? " sf-dropdown__item--active" : ""}`}
                onClick={() => handleSelect("checkout" as PageId)}
              >
                <EditorIcon name="shopping_cart" size={18} className="editor-header__page-icon" />
                <span style={{ flex: 1 }}>Kassa</span>
              </li>

              <li className="sf-dropdown__divider" />

              {/* ── Efter köp ──────────────────────── */}
              <li className="sf-dropdown__item--group-label">Efter köp</li>
              <li
                className={`sf-dropdown__item${currentPageId === "thank-you" ? " sf-dropdown__item--active" : ""}`}
                onClick={() => handleSelect("thank-you" as PageId)}
              >
                <EditorIcon name="celebration" size={18} className="editor-header__page-icon" />
                <span style={{ flex: 1 }}>Tack</span>
              </li>

              <li className="sf-dropdown__divider" />

              {/* ── Kundkonton ─────────────────────── */}
              <li className="sf-dropdown__item--group-label">Kundkonton</li>
              <li
                className={`sf-dropdown__item${currentPageId === "login" ? " sf-dropdown__item--active" : ""}`}
                onClick={() => handleSelect("login" as PageId)}
              >
                <EditorIcon name="login" size={18} className="editor-header__page-icon" />
                <span style={{ flex: 1 }}>Inloggning</span>
              </li>
              <li
                className={`sf-dropdown__item${currentPageId === "bookings" ? " sf-dropdown__item--active" : ""}`}
                onClick={() => handleSelect("bookings" as PageId)}
              >
                <EditorIcon name="calendar_month" size={18} className="editor-header__page-icon" />
                <span style={{ flex: 1 }}>Bokningar</span>
              </li>
              <li
                className={`sf-dropdown__item${currentPageId === "order-status" ? " sf-dropdown__item--active" : ""}`}
                onClick={() => handleSelect("order-status" as PageId)}
              >
                <EditorIcon name="local_shipping" size={18} className="editor-header__page-icon" />
                <span style={{ flex: 1 }}>Orderstatus</span>
              </li>
              <li
                className={`sf-dropdown__item${currentPageId === "profile" ? " sf-dropdown__item--active" : ""}`}
                onClick={() => handleSelect("profile" as PageId)}
              >
                <EditorIcon name="person" size={18} className="editor-header__page-icon" />
                <span style={{ flex: 1 }}>Profil</span>
              </li>

              <li className="sf-dropdown__divider" />

              {/* ── Tillbaka till tema ──────────────── */}
              <li
                className="sf-dropdown__item"
                onClick={() => handleSelect("home" as PageId)}
              >
                <EditorIcon name="storefront" size={18} className="editor-header__page-icon" />
                <span style={{ flex: 1 }}>Webbshoppens tema</span>
              </li>
            </>
          ) : (
            <>
              {pages.filter((p) => p.editorMode !== "settings").map((page) => (
                <li
                  key={page.id}
                  className={`sf-dropdown__item${page.id === currentPageId ? " sf-dropdown__item--active" : ""}`}
                  onClick={() => handleSelect(page.id)}
                >
                  <EditorIcon name={page.icon} size={18} className="editor-header__page-icon" />
                  <span style={{ flex: 1 }}>{page.label}</span>
                </li>
              ))}
              <li
                className="sf-dropdown__item"
                onClick={() => handleSelect("checkout" as PageId)}
              >
                <EditorIcon name="shopping_cart" size={18} className="editor-header__page-icon" />
                <span style={{ flex: 1 }}>Kassa och kundkonton</span>
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  );
}

// ─── Editor Status Trigger (Editor label + status badge → opens more menu) ──

function EditorStatusTrigger() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { hasUnsavedChanges } = usePublishBar();
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
    <div className="sf-dropdown editor-header__status-trigger-wrap" ref={ref}>
      <button
        type="button"
        className="editor-header__status-trigger"
        onClick={() => setOpen(!open)}
      >
        <span className="editor-header__status-trigger-label">{config?.property?.name || "Editor"}</span>
        <span className={`editor-header__status ${hasUnsavedChanges ? "editor-header__status--unsaved" : "editor-header__status--live"}`}>
          <span className="editor-header__status-dot" />
          {hasUnsavedChanges ? "Osparad" : "Live"}
        </span>
        <EditorIcon name="keyboard_arrow_down" size={20} className="editor-header__page-chevron" />
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

// ─── Header Rail Buttons (horizontal, replaces vertical EditorRail) ──

function HeaderRailButtons() {
  const { activeRail, setActiveRail } = useEditor();

  return (
    <nav className="editor-header__rail" aria-label="Editorpaneler">
      <div className="editor-header__rail-divider" />
      <Tooltip label="Sektioner" placement="bottom">
        <button
          type="button"
          className={`editor-rail__btn${activeRail === "sections" ? " editor-rail__btn--active" : ""}`}
          onClick={() => setActiveRail("sections")}
          aria-pressed={activeRail === "sections"}
          aria-label="Sektioner"
        >
          <EditorIcon name="grid_view" size={18} />
        </button>
      </Tooltip>
      <Tooltip label="Design" placement="bottom">
        <button
          type="button"
          className={`editor-rail__btn${activeRail === "settings" ? " editor-rail__btn--active" : ""}`}
          onClick={() => setActiveRail("settings")}
          aria-pressed={activeRail === "settings"}
          aria-label="Design"
        >
          <EditorIcon name="settings" size={18} />
        </button>
      </Tooltip>
    </nav>
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
