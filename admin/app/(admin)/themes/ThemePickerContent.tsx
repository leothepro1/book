"use client";

/**
 * ThemePickerContent — Theme browser + configure.
 *
 * Three views controlled by parent (HomeClient):
 *   1. grid      — browse all available themes
 *   2. detail    — full preview of a single theme (TD)
 *   3. configure — section settings for the active theme
 *
 * Theme list comes from getAllThemes() — adding a theme to the
 * registry automatically makes it appear in the picker.
 */

import { useCallback } from "react";
import { usePreview } from "../_components/GuestPreview";
import { usePublishBar } from "../_components/PublishBar";
import { useDraftUpdate } from "../_hooks/useDraftUpdate";
import { hasSelectedTheme } from "@/app/(guest)/_lib/themes/selection";
import { getAllThemes } from "@/app/(guest)/_lib/themes/registry";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import type { ThemeManifest } from "@/app/(guest)/_lib/themes/types";
import { ThemeDetailView } from "./ThemeDetailView";
import { ThemeConfigureView } from "./ThemeConfigureView";
import "./themes.css";

// Trigger registration so getAllThemes() returns results on the client
import "@/app/(guest)/_lib/themes/manifests/classic";
import "@/app/(guest)/_lib/themes/manifests/immersive";
import "@/app/(guest)/_lib/themes/manifests/sidebar";

export type ThemeView = "grid" | "detail" | "configure";

export function ThemePickerContent({
  view,
  detailManifest,
  onNavigate,
}: {
  view: ThemeView;
  detailManifest: ThemeManifest | null;
  onNavigate: (view: ThemeView, manifest?: ThemeManifest) => void;
}) {
  const { config } = usePreview();
  const { pushUndo } = usePublishBar();
  const saveDraft = useDraftUpdate();

  const allThemes = getAllThemes();
  const currentThemeId = config?.themeId ?? null;
  const hasTheme = config ? hasSelectedTheme(config) : false;

  const handleSelectTheme = useCallback(
    async (themeId: string) => {
      if (themeId === currentThemeId) {
        // Already active → go straight to configure
        onNavigate("configure");
        return;
      }

      const targetManifest = allThemes.find((t) => t.id === themeId);
      if (!targetManifest) {
        console.error(`[ThemePicker] Cannot select unknown theme "${themeId}".`);
        return;
      }

      // Store full undo state: previous themeId + version + design + section settings
      pushUndo({
        themeId: currentThemeId,
        themeVersion: config?.themeVersion ?? null,
        theme: config?.theme,
        sectionSettings: config?.sectionSettings ?? {},
      } as Partial<TenantConfig>);

      // Apply theme selection + pin to manifest version + design preset + clear section settings
      await saveDraft({
        themeId: themeId,
        themeVersion: targetManifest.version,
        theme: targetManifest.designPreset,
        sectionSettings: {},
      } as Partial<TenantConfig>);

      onNavigate("configure");
    },
    [currentThemeId, config?.theme, config?.sectionSettings, allThemes, pushUndo, saveDraft, onNavigate],
  );

  const handleCardClick = useCallback(
    (theme: ThemeManifest) => {
      if (hasTheme && theme.id === currentThemeId) {
        // Clicked the already-active theme → skip TD, go to configure
        onNavigate("configure");
      } else {
        // Different theme → show TD preview
        onNavigate("detail", theme);
      }
    },
    [hasTheme, currentThemeId, onNavigate],
  );

  // ── Detail view (TD) ──
  if (view === "detail") {
    // Guard: if manifest is missing (state corruption), fall back to grid
    if (!detailManifest) {
      onNavigate("grid");
      return null;
    }
    return (
      <ThemeDetailView
        manifest={detailManifest}
        onBack={() => onNavigate("grid")}
        onSelect={handleSelectTheme}
      />
    );
  }

  // ── Configure view ──
  if (view === "configure") {
    // Guard: if no theme is active, can't configure — fall back to grid
    if (!hasTheme) {
      onNavigate("grid");
      return null;
    }
    const activeManifest = allThemes.find((t) => t.id === currentThemeId);
    // Guard: if theme ID doesn't match any known manifest, fall back to grid
    if (!activeManifest) {
      console.error(
        `[ThemePicker] Active themeId "${currentThemeId}" not found in registry. ` +
        `Available: [${allThemes.map(t => t.id).join(", ")}]. Falling back to grid.`
      );
      onNavigate("grid");
      return null;
    }
    return <ThemeConfigureView manifest={activeManifest} />;
  }

  // ── Grid view ──
  return (
    <div className="theme-picker">
      <div className="theme-picker__grid">
        {allThemes.map((theme) => (
          <ThemeCard
            key={theme.id}
            manifest={theme}
            isActive={hasTheme && theme.id === currentThemeId}
            onClick={() => handleCardClick(theme)}
          />
        ))}
      </div>
      {/* Preload theme demo iframes so detail view opens instantly */}
      <div style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }}>
        {allThemes.map((theme) => (
          <iframe
            key={theme.id}
            src={`/theme-demo/${theme.id}`}
            title={`Preload ${theme.name}`}
            tabIndex={-1}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   Theme Card
   ════════════════════════════════════════════ */

function ThemeCard({
  manifest,
  isActive,
  onClick,
}: {
  manifest: ThemeManifest;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`theme-card ${isActive ? "theme-card--active" : ""}`}
      onClick={onClick}
    >
      <div className="theme-card__img">
        <img
          src={manifest.thumbnail}
          alt={manifest.name}
          draggable={false}
        />
      </div>
      <div className="theme-card__name">{manifest.name}</div>
    </button>
  );
}
