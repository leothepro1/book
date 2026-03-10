"use client";

/**
 * Settings Panel
 * ──────────────
 * Left panel content when the "settings" rail tab is active.
 *
 * Future: theme/design controls (colors, typography, tile styles).
 * This panel will connect to the existing ThemeConfig model
 * and reuse the Design tab's controls.
 */

export function SettingsPanel() {
  return (
    <>
      <div className="editor-panel__header">
        <span className="editor-panel__title">Inställningar</span>
      </div>
      <div className="editor-panel__body">
        <div className="editor-panel__empty">
          <svg
            className="editor-panel__empty-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
          <p className="editor-panel__empty-text">
            Tema och designinställningar kopplas här i framtiden.
          </p>
        </div>
      </div>
    </>
  );
}
