"use client";

import { useCallback, useState, useTransition, useRef } from "react";
import { createPortal } from "react-dom";
import { PreviewProvider, GuestPreviewFrame, usePreview } from "../_components/GuestPreview";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import { updateDraft } from "../_lib/tenant/updateDraft";
import { publishDraft, discardDraft } from "../_lib/tenant/publishDraft";
import "../_components/GuestPreview/preview.css";
import "./design.css";
import "../_components/admin-page.css";

/* ── Types ── */

type DesignView = "main" | "colors" | "header" | "wallpaper" | "buttons" | "text" | "cards";

interface Props {
  initialConfig: TenantConfig;
}

/* ── Font Options ── */

const FONT_OPTIONS: { key: string; label: string; family: string }[] = [
  { key: "albert_sans", label: "Albert Sans", family: "Albert Sans, sans-serif" },
  { key: "dm_sans", label: "DM Sans", family: "DM Sans, sans-serif" },
  { key: "epilogue", label: "Epilogue", family: "Epilogue, sans-serif" },
  { key: "ibm_plex_sans", label: "IBM Plex Sans", family: "IBM Plex Sans, sans-serif" },
  { key: "inter", label: "Inter", family: "Inter, sans-serif" },
  { key: "link_sans", label: "Link Sans", family: "Link Sans, sans-serif" },
  { key: "manrope", label: "Manrope", family: "Manrope, sans-serif" },
  { key: "oxanium", label: "Oxanium", family: "Oxanium, sans-serif" },
  { key: "poppins", label: "Poppins", family: "Poppins, sans-serif" },
  { key: "red_hat_display", label: "Red Hat Display", family: "Red Hat Display, sans-serif" },
  { key: "roboto", label: "Roboto", family: "Roboto, sans-serif" },
  { key: "rubik", label: "Rubik", family: "Rubik, sans-serif" },
  { key: "space_grotesk", label: "Space Grotesk", family: "Space Grotesk, sans-serif" },
  { key: "syne", label: "Syne", family: "Syne, sans-serif" },
  { key: "biorhyme", label: "BioRhyme", family: "BioRhyme, serif" },
  { key: "bitter", label: "Bitter", family: "Bitter, serif" },
  { key: "caudex", label: "Caudex", family: "Caudex, serif" },
  { key: "corben", label: "Corben", family: "Corben, serif" },
  { key: "domine", label: "Domine", family: "Domine, serif" },
  { key: "hahmlet", label: "Hahmlet", family: "Hahmlet, serif" },
  { key: "avenir", label: "Avenir", family: "Avenir, sans-serif" },
  { key: "playfair", label: "Playfair Display", family: "Playfair Display, serif" },
];

const MODAL_FONTS_URL = "https://fonts.googleapis.com/css2?" +
  FONT_OPTIONS.filter(f => f.key !== "avenir" && f.key !== "link_sans")
    .map(f => "family=" + f.label.replace(/ /g, "+") + ":wght@400;600")
    .join("&") + "&display=swap";

/* ── Button Options ── */

type ButtonVariantOption = "solid" | "outline";
type ButtonRadiusOption = "square" | "rounded" | "round" | "rounder" | "full";

const VARIANT_OPTIONS: { key: ButtonVariantOption; label: string }[] = [
  { key: "solid", label: "Solid" },
  { key: "outline", label: "Outline" },
];

const RADIUS_OPTIONS: { key: ButtonRadiusOption; label: string; icon: React.ReactNode }[] = [
  { key: "square", label: "Square", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 20V4H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> },
  { key: "round", label: "Round", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 20V6C4 4.89543 4.89543 4 6 4H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> },
  { key: "rounder", label: "Rounder", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 20V8C4 5.79086 5.79086 4 8 4H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> },
  { key: "full", label: "Full", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 20V12C4 7.58172 7.58172 4 12 4H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> },
];

/* ── Color Fields Config ── */

type ColorKey = "background" | "buttonBg" | "buttonText" | "text";

const COLOR_FIELDS: { key: ColorKey; label: string }[] = [
  { key: "background", label: "Background" },
  { key: "buttonBg", label: "Buttons" },
  { key: "buttonText", label: "Button text" },
  { key: "text", label: "Page text" },
];

/* ════════════════════════════════════════════
   Entry Point
   ════════════════════════════════════════════ */

export default function DesignClient({ initialConfig }: Props) {
  return (
    <PreviewProvider initialConfig={initialConfig} enableRealtime={true}>
      <DesignInner />
    </PreviewProvider>
  );
}

/* ════════════════════════════════════════════
   Design Inner (undo/redo/publish)
   ════════════════════════════════════════════ */

function DesignInner() {
  const [undoStack, setUndoStack] = useState<Partial<TenantConfig>[]>([]);
  const [redoStack, setRedoStack] = useState<Partial<TenantConfig>[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const { config } = usePreview();

  const pushUndo = useCallback((snapshot: Partial<TenantConfig>) => {
    setUndoStack(prev => [...prev, snapshot]);
    setRedoStack([]);
    setHasUnsavedChanges(true);
  }, []);

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0 || isUndoing) return;
    setIsUndoing(true);
    const previousSnapshot = undoStack[undoStack.length - 1];
    if (config) setRedoStack(prev => [...prev, { theme: config.theme } as Partial<TenantConfig>]);
    setUndoStack(prev => prev.slice(0, -1));
    const result = await updateDraft(previousSnapshot);
    if (!result.success) console.error("[Undo] Failed:", result.error);
    if (undoStack.length <= 1) {
      await discardDraft();
      setHasUnsavedChanges(false);
    }
    setIsUndoing(false);
  }, [undoStack, config, isUndoing]);

  const handleRedo = useCallback(async () => {
    if (redoStack.length === 0 || isUndoing) return;
    setIsUndoing(true);
    const redoSnapshot = redoStack[redoStack.length - 1];
    if (config) setUndoStack(prev => [...prev, { theme: config.theme } as Partial<TenantConfig>]);
    setRedoStack(prev => prev.slice(0, -1));
    const result = await updateDraft(redoSnapshot);
    if (!result.success) console.error("[Redo] Failed:", result.error);
    setHasUnsavedChanges(true);
    setIsUndoing(false);
  }, [redoStack, config, isUndoing]);

  const handlePublish = useCallback(async () => {
    if (isPublishing) return;
    setIsPublishing(true);
    const result = await publishDraft();
    if (result.success) {
      setUndoStack([]);
      setRedoStack([]);
      setHasUnsavedChanges(false);
    } else {
      console.error("[Publish] Failed:", result.error);
    }
    setIsPublishing(false);
  }, [isPublishing]);

  return (
    <div className="admin-page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title">Design</h1>
          <div className={`design-actions ${hasUnsavedChanges ? "design-actions-visible" : ""}`}>
            <div className="design-actions-left">
              <button type="button" className="design-action-icon" onClick={handleUndo} disabled={undoStack.length === 0 || isUndoing} aria-label="Undo">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M232,184a8,8,0,0,1-16,0A88,88,0,0,0,65.78,121.78L43.4,144H88a8,8,0,0,1,0,16H24a8,8,0,0,1-8-8V88a8,8,0,0,1,16,0v44.77l22.48-22.33A104,104,0,0,1,232,184Z" /></svg>
              </button>
              <button type="button" className="design-action-icon" onClick={handleRedo} disabled={redoStack.length === 0 || isUndoing} aria-label="Redo">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M240,88v64a8,8,0,0,1-8,8H168a8,8,0,0,1,0-16h44.6l-22.36-22.21A88,88,0,0,0,40,184a8,8,0,0,1-16,0,104,104,0,0,1,177.54-73.54L224,132.77V88a8,8,0,0,1,16,0Z" /></svg>
              </button>
            </div>
            <button type="button" className="design-publish-btn" onClick={handlePublish} disabled={isPublishing}>
              {isPublishing && <SpinnerIcon />}
              <span>Spara</span>
            </button>
          </div>
        </div>
        <DesignViewManager pushUndo={pushUndo} />
      </div>
      <div className="admin-preview">
        <GuestPreviewFrame route="/p/[token]" className="preview-widget-sticky" />
      </div>
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg className="design-spinner" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="32" strokeDashoffset="12" />
    </svg>
  );
}

/* ════════════════════════════════════════════
   View Manager
   ════════════════════════════════════════════ */

function DesignViewManager({ pushUndo }: { pushUndo: (s: Partial<TenantConfig>) => void }) {
  const [currentView, setCurrentView] = useState<DesignView>("main");
  const [previousView, setPreviousView] = useState<DesignView | null>(null);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [isTransitioning, setIsTransitioning] = useState(false);

  const navigateTo = useCallback((view: DesignView) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setDirection("forward");
    setPreviousView(currentView);
    requestAnimationFrame(() => {
      setTimeout(() => { setCurrentView(view); setPreviousView(null); setTimeout(() => setIsTransitioning(false), 500); }, 300);
    });
  }, [currentView, isTransitioning]);

  const navigateBack = useCallback(() => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setDirection("back");
    setPreviousView(currentView);
    requestAnimationFrame(() => {
      setTimeout(() => { setCurrentView("main"); setPreviousView(null); setTimeout(() => setIsTransitioning(false), 500); }, 300);
    });
  }, [currentView, isTransitioning]);

  const exitClass = direction === "forward" ? "design-view-exit-left" : "design-view-exit-right";
  const enterClass = direction === "forward" ? "design-view-enter-right" : "design-view-enter-left";
  const showPrevious = previousView !== null;
  const activeView = showPrevious ? previousView : currentView;

  return (
    <div className="design-view-container">
      <div key={activeView + (showPrevious ? "-exit" : "-active")} className={"design-view " + (showPrevious ? exitClass : enterClass)}>
        {activeView === "main" ? (
          <MainView onNavigate={navigateTo} />
        ) : activeView === "colors" ? (
          <ColorsView onBack={navigateBack} pushUndo={pushUndo} />
        ) : activeView === "header" ? (
          <HeaderView onBack={navigateBack} pushUndo={pushUndo} />
        ) : activeView === "buttons" ? (
          <ButtonsView onBack={navigateBack} pushUndo={pushUndo} />
        ) : activeView === "text" ? (
          <TextView onBack={navigateBack} pushUndo={pushUndo} />
        ) : activeView === "cards" ? (
          <CardsView onBack={navigateBack} pushUndo={pushUndo} />
        ) : (
          <PlaceholderView label={activeView} onBack={navigateBack} />
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   Main View
   ════════════════════════════════════════════ */

function MainView({ onNavigate }: { onNavigate: (v: DesignView) => void }) {
  const { config } = usePreview();
  const theme = config?.theme;

  const bgLabel = theme?.background?.mode === "gradient" ? "Gradient" : theme?.background?.mode === "image" ? "Image" : theme?.background?.mode === "blur" ? "Blur" : "Fill";
  const btnLabel = (theme?.buttons?.variant === "outline" ? "Outline" : "Solid") + " · " + ((theme?.buttons?.radius || "rounder").charAt(0).toUpperCase() + (theme?.buttons?.radius || "rounder").slice(1));
  const fontLabel = FONT_OPTIONS.find(f => f.key === theme?.typography?.headingFont)?.label || "Inter";

  return (
    <>
      <div className="design-section">
        <div className="design-section-header"><span className="design-section-label design-stagger-item">Theme</span></div>
        <DesignRow icon={<ThemeIcon />} label="Theme" value="Custom" className="design-stagger-item" />
      </div>
      <div className="design-section">
        <div className="design-section-header"><span className="design-section-label design-stagger-item">Customize theme</span></div>
        <DesignRow icon={<HeaderIcon logoUrl={theme?.header?.logoUrl} />} label="Header" value={theme?.header?.logoUrl ? "Logo uploaded" : "No logo"} onClick={() => onNavigate("header")} className="design-stagger-item" />
        <DesignRow icon={<WallpaperIcon />} label="Wallpaper" value={bgLabel} onClick={() => onNavigate("wallpaper")} className="design-stagger-item" />
        <DesignRow icon={<ButtonsIcon variant={theme?.buttons?.variant} color={theme?.colors?.buttonBg} />} label="Buttons" value={btnLabel} onClick={() => onNavigate("buttons")} className="design-stagger-item" />
        <DesignRow icon={<TextIcon font={theme?.typography?.headingFont} />} label="Text" value={fontLabel} onClick={() => onNavigate("text")} className="design-stagger-item" />
        <DesignRow icon={<ColorsIcon bg={theme?.colors?.background} accent={theme?.colors?.buttonBg} text={theme?.colors?.text} buttonText={theme?.colors?.buttonText} />} label="Colors" onClick={() => onNavigate("colors")} className="design-stagger-item" />
        <DesignRow icon={<CardsIcon />} label="Startsida" value={`${config?.home?.cards?.filter((c: any) => c.isActive).length || 0} kort`} onClick={() => onNavigate("cards")} className="design-stagger-item" />
      </div>
    </>
  );
}

/* ════════════════════════════════════════════
   Shared Components
   ════════════════════════════════════════════ */

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="design-back-btn design-stagger-item" type="button">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
      <span className="design-back-label">{label}</span>
    </button>
  );
}

function ColorField({ label, value, onChange, onPickerChange, className = "" }: {
  label: string; value: string; onChange: (v: string) => void; onPickerChange: (v: string) => void; className?: string;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);
  return (
    <div className={"design-color-field " + className}>
      <span className="design-field-label">{label}</span>
      <div className="design-color-input-row">
        <input type="text" value={value.toUpperCase()} onChange={(e) => onChange(e.target.value)} className="design-color-input" spellCheck={false} autoComplete="off" />
        <div className="design-color-swatch" style={{ background: value }} onClick={() => pickerRef.current?.click()} />
        <input ref={pickerRef} type="color" value={value.length === 7 ? value : "#000000"} onChange={(e) => onPickerChange(e.target.value)} className="design-color-picker-hidden" tabIndex={-1} aria-hidden="true" />
      </div>
    </div>
  );
}

function useColorEditor(pushUndo: (s: Partial<TenantConfig>) => void, snapshotFn: () => Partial<TenantConfig>, themeColors: any) {
  const [isPending, startTransition] = useTransition();
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [localColors, setLocalColors] = useState<Record<string, string>>({});

  const getColor = (key: string): string => localColors[key] || themeColors?.[key] || "#FFFFFF";

  const saveColor = useCallback((key: string, value: string) => {
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(() => {
      pushUndo(snapshotFn());
      startTransition(async () => {
        const result = await updateDraft({ theme: { colors: { [key]: value } } } as any);
        if (!result.success) console.error("[Color] Save failed:", result.error);
      });
    }, 500);
  }, [pushUndo, snapshotFn]);

  const handleChange = useCallback((key: string, value: string) => {
    let n = value.trim();
    if (n && !n.startsWith("#")) n = "#" + n;
    setLocalColors(prev => ({ ...prev, [key]: n }));
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(n)) saveColor(key, n);
  }, [saveColor]);

  const handlePicker = useCallback((key: string, value: string) => {
    setLocalColors(prev => ({ ...prev, [key]: value }));
    saveColor(key, value);
  }, [saveColor]);

  // Sync when server confirms
  const prevRef = useRef(themeColors);
  if (themeColors !== prevRef.current) { prevRef.current = themeColors; setLocalColors({}); }

  return { getColor, handleChange, handlePicker, isPending };
}

/* ════════════════════════════════════════════
   Colors View
   ════════════════════════════════════════════ */

function ColorsView({ onBack, pushUndo }: { onBack: () => void; pushUndo: (s: Partial<TenantConfig>) => void }) {
  const { config } = usePreview();
  const theme = config?.theme;
  const snapshot = useCallback(() => ({ theme: { colors: { ...theme?.colors } } } as Partial<TenantConfig>), [theme?.colors]);
  const { getColor, handleChange, handlePicker, isPending } = useColorEditor(pushUndo, snapshot, theme?.colors);

  return (
    <>
      <BackButton label="Colors" onClick={onBack} />
      <div className="design-color-fields">
        {COLOR_FIELDS.map(({ key, label }) => (
          <ColorField key={key} label={label} value={getColor(key)} onChange={(v) => handleChange(key, v)} onPickerChange={(v) => handlePicker(key, v)} className="design-stagger-item" />
        ))}
      </div>
      {isPending && <div className="design-saving">Saving...</div>}
    </>
  );
}

/* ════════════════════════════════════════════
   Header View
   ════════════════════════════════════════════ */

function HeaderView({ onBack, pushUndo }: { onBack: () => void; pushUndo: (s: Partial<TenantConfig>) => void }) {
  const { config } = usePreview();
  const theme = config?.theme;
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const [showLogoModal, setShowLogoModal] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentLogoUrl = theme?.header?.logoUrl || "";
  const currentLogoWidth = theme?.header?.logoWidth ?? 120;
  const [localWidth, setLocalWidth] = useState<number>(currentLogoWidth);
  const widthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prevWidth = useRef(currentLogoWidth);
  if (currentLogoWidth !== prevWidth.current) { prevWidth.current = currentLogoWidth; setLocalWidth(currentLogoWidth); }

  const snapshotHeader = useCallback(() => ({ theme: { header: { ...theme?.header } } } as Partial<TenantConfig>), [theme?.header]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    pushUndo(snapshotHeader());
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/tenant/upload", { method: "POST", body: formData });
      if (!res.ok) { console.error("[Header] Upload failed"); setIsUploading(false); return; }
      const { url } = await res.json();
      startTransition(async () => {
        await updateDraft({ theme: { header: { logoUrl: url } } } as any);
        setIsUploading(false);
      });
    } catch (err) { console.error("[Header] Upload error:", err); setIsUploading(false); }
    e.target.value = "";
  }, [pushUndo, snapshotHeader]);

  const handleWidthChange = useCallback((value: number) => {
    setLocalWidth(value);
    if (widthTimerRef.current) clearTimeout(widthTimerRef.current);
    widthTimerRef.current = setTimeout(() => {
      pushUndo(snapshotHeader());
      startTransition(async () => {
        await updateDraft({ theme: { header: { logoWidth: value } } } as any);
      });
    }, 300);
  }, [pushUndo, snapshotHeader]);

  const handleRemoveLogo = useCallback(async () => {
    if (isRemoving) return;
    setIsRemoving(true);
    pushUndo(snapshotHeader());
    const result = await updateDraft({ theme: { header: { logoUrl: "" } } } as any);
    if (!result.success) console.error("[Header] Remove failed:", result.error);
    setIsRemoving(false);
    setShowLogoModal(false);
  }, [isRemoving, pushUndo, snapshotHeader]);

  const handleEditClick = useCallback(() => {
    if (currentLogoUrl) {
      setShowLogoModal(true);
    } else {
      fileInputRef.current?.click();
    }
  }, [currentLogoUrl]);

  return (
    <>
      <BackButton label="Header" onClick={onBack} />

      <div className="design-field-group design-stagger-item">
        <span className="design-field-label">Profile image</span>
        <div className="design-logo-upload">
          <div className={"design-logo-avatar " + (isUploading ? "design-logo-shimmer" : "")}>
            {currentLogoUrl && !isUploading ? (
              <img src={currentLogoUrl} alt="Logo" className="design-logo-img" />
            ) : !isUploading ? (
              <svg width="40" height="40" viewBox="0 0 256 256" fill="#ccc"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88.11,88.11,0,0,1-71.87-37.27,64,64,0,0,1,143.74,0A88.11,88.11,0,0,1,128,216Zm0-104a32,32,0,1,0-32-32A32,32,0,0,0,128,112Z" /></svg>
            ) : null}
          </div>
          <button type="button" className={"design-logo-btn " + (currentLogoUrl ? "design-logo-btn-edit" : "")} onClick={handleEditClick}>
            {currentLogoUrl ? <span>Edit</span> : <><span className="design-logo-btn-plus">+</span><span>Add</span></>}
          </button>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" onChange={handleUpload} className="design-file-hidden" aria-hidden="true" />
        </div>
      </div>

      <div className="design-field-group design-stagger-item">
        <span className="design-field-label">Logo width</span>
        <div className="design-slider-row">
          <input type="range" min={40} max={300} step={1} value={localWidth} onChange={(e) => handleWidthChange(Number(e.target.value))} className="design-slider" />
          <div className="design-slider-input-wrap">
            <input type="number" min={40} max={300} value={localWidth} onChange={(e) => handleWidthChange(Math.min(300, Math.max(40, Number(e.target.value) || 40)))} className="design-slider-input" />
            <span className="design-slider-unit">px</span>
          </div>
        </div>
      </div>

      {isPending && <div className="design-saving">Saving...</div>}

      {showLogoModal && createPortal(
        <>
          <div className="design-modal-backdrop" onClick={() => setShowLogoModal(false)} />
          <div className="design-modal design-modal-sm">
            <button type="button" className="design-logo-modal-btn design-logo-modal-primary" onClick={() => { setShowLogoModal(false); fileInputRef.current?.click(); }}>Edit logo</button>
            <button type="button" className="design-logo-modal-btn design-logo-modal-danger" onClick={handleRemoveLogo} disabled={isRemoving}>
              {isRemoving && <SpinnerIcon />}
              <span>Remove logo</span>
            </button>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

/* ════════════════════════════════════════════
   Buttons View
   ════════════════════════════════════════════ */

function ButtonsView({ onBack, pushUndo }: { onBack: () => void; pushUndo: (s: Partial<TenantConfig>) => void }) {
  const { config } = usePreview();
  const theme = config?.theme;
  const [isPending, startTransition] = useTransition();

  const currentVariant = theme?.buttons?.variant || "solid";
  const currentRadius = theme?.buttons?.radius || "rounder";

  const snapshotButtons = useCallback(() => ({ theme: { buttons: { ...theme?.buttons }, colors: { ...theme?.colors } } } as Partial<TenantConfig>), [theme?.buttons, theme?.colors]);
  const colorSnapshot = useCallback(() => snapshotButtons(), [snapshotButtons]);
  const { getColor, handleChange, handlePicker, isPending: colorPending } = useColorEditor(pushUndo, colorSnapshot, theme?.colors);

  const saveButtonProp = useCallback((prop: string, value: string) => {
    pushUndo(snapshotButtons());
    startTransition(async () => {
      await updateDraft({ theme: { buttons: { [prop]: value } } } as any);
    });
  }, [pushUndo, snapshotButtons]);

  return (
    <>
      <BackButton label="Buttons" onClick={onBack} />

      <div className="design-field-group design-stagger-item">
        <span className="design-field-label">Button style</span>
        <div className="design-toggle-row design-toggle-2col">
          {VARIANT_OPTIONS.map(({ key, label }) => (
            <button key={key} type="button" className={"design-toggle-card " + (currentVariant === key ? "design-toggle-active" : "")} onClick={() => saveButtonProp("variant", key)}>
              <div className="design-toggle-preview">
                <div className={"design-btn-preview " + (key === "outline" ? "design-btn-preview-outline" : "design-btn-preview-solid")} />
              </div>
              <span className="design-toggle-label">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="design-field-group design-stagger-item">
        <span className="design-field-label">Corner roundness</span>
        <div className="design-toggle-row design-toggle-4col">
          {RADIUS_OPTIONS.map(({ key, label, icon }) => (
            <button key={key} type="button" className={"design-toggle-card " + (currentRadius === key ? "design-toggle-active" : "")} onClick={() => saveButtonProp("radius", key)}>
              <div className="design-toggle-icon">{icon}</div>
              <span className="design-toggle-label">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <ColorField label="Button color" value={getColor("buttonBg")} onChange={(v) => handleChange("buttonBg", v)} onPickerChange={(v) => handlePicker("buttonBg", v)} className="design-stagger-item" />
      <ColorField label="Button text color" value={getColor("buttonText")} onChange={(v) => handleChange("buttonText", v)} onPickerChange={(v) => handlePicker("buttonText", v)} className="design-stagger-item" />

      {(isPending || colorPending) && <div className="design-saving">Saving...</div>}
    </>
  );
}

/* ════════════════════════════════════════════
   Text View
   ════════════════════════════════════════════ */

function TextView({ onBack, pushUndo }: { onBack: () => void; pushUndo: (s: Partial<TenantConfig>) => void }) {
  const { config } = usePreview();
  const theme = config?.theme;
  const [showModal, setShowModal] = useState(false);
  const [isPending, startTransition] = useTransition();

  const currentFont = theme?.typography?.headingFont || "inter";
  const currentLabel = FONT_OPTIONS.find(f => f.key === currentFont)?.label || "Inter";
  const currentFamily = FONT_OPTIONS.find(f => f.key === currentFont)?.family || "Inter, sans-serif";

  const snapshotTypography = useCallback(() => ({ theme: { typography: { ...theme?.typography }, colors: { ...theme?.colors } } } as Partial<TenantConfig>), [theme?.typography, theme?.colors]);
  const { getColor, handleChange, handlePicker, isPending: colorPending } = useColorEditor(pushUndo, snapshotTypography, theme?.colors);

  const handleFontSelect = useCallback((fontKey: string) => {
    pushUndo(snapshotTypography());
    setShowModal(false);
    startTransition(async () => {
      await updateDraft({ theme: { typography: { headingFont: fontKey, bodyFont: fontKey } } } as any);
    });
  }, [pushUndo, snapshotTypography]);

  return (
    <>
      <BackButton label="Text" onClick={onBack} />

      <div className="design-field-group design-stagger-item">
        <span className="design-field-label">Title font</span>
        <button type="button" className="design-font-selector" onClick={() => setShowModal(true)}>
          <span className="design-font-selector-name" style={{ fontFamily: currentFamily }}>{currentLabel}</span>
          <ChevronRight />
        </button>
      </div>

      <ColorField label="Page text color" value={getColor("text")} onChange={(v) => handleChange("text", v)} onPickerChange={(v) => handlePicker("text", v)} className="design-stagger-item" />
      <ColorField label="Title color" value={getColor("buttonBg")} onChange={(v) => handleChange("buttonBg", v)} onPickerChange={(v) => handlePicker("buttonBg", v)} className="design-stagger-item" />

      {(isPending || colorPending) && <div className="design-saving">Saving...</div>}

      {showModal && createPortal(
        <>
          <link rel="stylesheet" href={MODAL_FONTS_URL} />
          <div className="design-modal-backdrop" onClick={() => setShowModal(false)} />
          <div className="design-modal">
            <div className="design-modal-header">
              <span className="design-modal-title">Page font</span>
              <button type="button" className="design-modal-close" onClick={() => setShowModal(false)} aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="design-modal-grid">
              {FONT_OPTIONS.map(({ key, label, family }) => (
                <button key={key} type="button" className={"design-font-option " + (currentFont === key ? "design-font-option-active" : "")} onClick={() => handleFontSelect(key)} style={{ fontFamily: family }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

/* ════════════════════════════════════════════
   Placeholder View
   ════════════════════════════════════════════ */

function PlaceholderView({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <>
      <BackButton label={label.charAt(0).toUpperCase() + label.slice(1)} onClick={onBack} />
      <div className="design-stagger-item" style={{ padding: "24px 0", color: "#999", fontSize: "0.9rem" }}>Coming soon...</div>
    </>
  );
}

/* ════════════════════════════════════════════
   Design Row
   ════════════════════════════════════════════ */

function DesignRow({ icon, label, value, onClick, className = "" }: { icon: React.ReactNode; label: string; value?: string; onClick?: () => void; className?: string }) {
  return (
    <button onClick={onClick} className={"design-row " + className} type="button">
      <div className="design-row-left"><div className="design-row-icon">{icon}</div><span className="design-row-label">{label}</span></div>
      <div className="design-row-right">{value && <span className="design-row-value">{value}</span>}<ChevronRight /></div>
    </button>
  );
}

function ChevronRight() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>;
}

/* ════════════════════════════════════════════
   Icons (config-driven)
   ════════════════════════════════════════════ */

function ThemeIcon() {
  return (
    <div className="design-icon-box">
      <svg width="20" height="20" viewBox="0 0 256 256" fill="#7F22FE">
        <path d="M200,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V40A16,16,0,0,0,200,24Zm0,192H56V40H200V216ZM176,68a12,12,0,1,1-12-12A12,12,0,0,1,176,68Z" />
      </svg>
    </div>
  );
}

function HeaderIcon({ logoUrl }: { logoUrl?: string }) {
  return (
    <div className="design-icon-box">
      {logoUrl ? (
        <img src={logoUrl} alt="" style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 4 }} />
      ) : (
        <svg width="20" height="20" viewBox="0 0 256 256" fill="#999">
          <path d="M224,48H32A8,8,0,0,0,24,56v56a8,8,0,0,0,8,8H224a8,8,0,0,0,8-8V56A8,8,0,0,0,224,48Zm-8,56H40V64H216Zm8,40H32a8,8,0,0,0-8,8v48a8,8,0,0,0,8,8H224a8,8,0,0,0,8-8V152A8,8,0,0,0,224,144Zm-8,48H40V160H216Z" />
        </svg>
      )}
    </div>
  );
}

function WallpaperIcon() {
  return (
    <div className="design-icon-box">
      <svg width="20" height="20" viewBox="0 0 256 256" fill="#999">
        <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM176,88a16,16,0,1,1-16-16A16,16,0,0,1,176,88Zm44,80a8,8,0,0,1-3.2,6.4l-64,48a8,8,0,0,1-9.6,0L96,189.33,52.8,174.4a8,8,0,0,1,9.6-12.8L96,186.67l46.4-34.8a8,8,0,0,1,9.6,0l64,48A8,8,0,0,1,220,168Z" />
      </svg>
    </div>
  );
}

function ButtonsIcon({ variant, color }: { variant?: string; color?: string }) {
  const bg = color || "#8B3DFF";
  const isOutline = variant === "outline";
  return (
    <div className="design-icon-box">
      <div style={{ width: 28, height: 14, borderRadius: 4, background: isOutline ? "transparent" : bg, border: isOutline ? "2px solid " + bg : "none" }} />
    </div>
  );
}

function TextIcon({ font }: { font?: string }) {
  const family = FONT_OPTIONS.find(f => f.key === font)?.family || "Inter, sans-serif";
  return (
    <div className="design-icon-box">
      <span style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", fontFamily: family, lineHeight: 1 }}>Aa</span>
    </div>
  );
}

function ColorsIcon({ bg, accent, text, buttonText }: { bg?: string; accent?: string; text?: string; buttonText?: string }) {
  return (
    <div className="design-icon-box" style={{ display: "flex", gap: 2, alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 7, height: 20, borderRadius: 2, background: bg || "#fff" }} />
      <div style={{ width: 7, height: 20, borderRadius: 2, background: accent || "#8B3DFF" }} />
      <div style={{ width: 7, height: 20, borderRadius: 2, background: buttonText || "#fff" }} />
      <div style={{ width: 7, height: 20, borderRadius: 2, background: text || "#2D2C2B" }} />
    </div>
  );
}

/* ════════════════════════════════════════════
   Cards View
   ════════════════════════════════════════════ */

import type { Card } from "@/app/(guest)/_lib/portal/homeLinks";

function CardsView({ onBack, pushUndo }: { onBack: () => void; pushUndo: (s: Partial<TenantConfig>) => void }) {
  const { config } = usePreview();
  const [showModal, setShowModal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const cards: Card[] = (config?.home?.cards || []) as Card[];

  const handleAdd = useCallback((newCard: Card) => {
    const updated = [...cards, newCard];
    pushUndo({ home: { version: 1, links: config?.home?.links || [], cards } } as any);
    startTransition(async () => {
      await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: updated } } as any);
    });
    setShowModal(false);
  }, [cards, config, pushUndo]);

  const handleToggle = useCallback((id: string) => {
    const updated = cards.map(c => c.id === id ? { ...c, isActive: !c.isActive } : c);
    startTransition(async () => {
      await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: updated } } as any);
    });
  }, [cards, config]);

  const handleDelete = useCallback((id: string) => {
    const updated = cards.filter(c => c.id !== id);
    pushUndo({ home: { version: 1, links: config?.home?.links || [], cards } } as any);
    startTransition(async () => {
      await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: updated } } as any);
    });
  }, [cards, config, pushUndo]);

  const handleMoveUp = useCallback((id: string) => {
    const sorted = [...cards].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex(c => c.id === id);
    if (idx <= 0) return;
    const updated = sorted.map((c, i) => {
      if (i === idx - 1) return { ...c, sortOrder: sorted[idx].sortOrder };
      if (i === idx) return { ...c, sortOrder: sorted[idx - 1].sortOrder };
      return c;
    });
    startTransition(async () => {
      await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: updated } } as any);
    });
  }, [cards, config]);

  const handleMoveDown = useCallback((id: string) => {
    const sorted = [...cards].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex(c => c.id === id);
    if (idx >= sorted.length - 1) return;
    const updated = sorted.map((c, i) => {
      if (i === idx + 1) return { ...c, sortOrder: sorted[idx].sortOrder };
      if (i === idx) return { ...c, sortOrder: sorted[idx + 1].sortOrder };
      return c;
    });
    startTransition(async () => {
      await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: updated } } as any);
    });
  }, [cards, config]);

  const sorted = [...cards].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <BackButton label="Startsida" onClick={onBack} />

      <div className="design-section design-stagger-item">
        <div className="design-section-header">
          <span className="design-section-label">Kort i "Utforska mer"</span>
        </div>

        {sorted.length === 0 && (
          <div style={{ padding: "16px 0", color: "#999", fontSize: 13 }}>
            Inga kort ännu. Klicka på + för att lägga till.
          </div>
        )}

        {sorted.map((card, idx) => (
          <div key={card.id} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 0", borderBottom: "1px solid #f0f0f0",
          }}>
            {card.image ? (
              <div style={{
                width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                backgroundImage: `url(${card.image})`,
                backgroundSize: "cover", backgroundPosition: "center",
              }} />
            ) : (
              <div style={{
                width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                background: "#f3f3f3", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="20" height="20" viewBox="0 0 256 256" fill="#ccc">
                  <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200Z"/>
                </svg>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.title}</div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{card.type}</div>
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button type="button" onClick={() => handleMoveUp(card.id)} disabled={idx === 0}
                style={{ padding: 4, border: "none", background: "none", cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.3 : 1, color: "#666" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>
              </button>
              <button type="button" onClick={() => handleMoveDown(card.id)} disabled={idx === sorted.length - 1}
                style={{ padding: 4, border: "none", background: "none", cursor: idx === sorted.length - 1 ? "default" : "pointer", opacity: idx === sorted.length - 1 ? 0.3 : 1, color: "#666" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
              </button>
              <button type="button" onClick={() => handleToggle(card.id)}
                style={{ padding: 4, border: "none", background: "none", cursor: "pointer", color: card.isActive ? "#22c55e" : "#ccc" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
              </button>
              <button type="button" onClick={() => handleDelete(card.id)}
                style={{ padding: 4, border: "none", background: "none", cursor: "pointer", color: "#f87171" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
        ))}

        <button type="button" onClick={() => setShowModal(true)}
          style={{
            marginTop: 12, width: "100%", padding: "10px 0", border: "1.5px dashed #d0d0d0",
            borderRadius: 10, background: "none", cursor: "pointer", color: "#888",
            fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
          Lägg till kort
        </button>
      </div>

      {isPending && <div className="design-saving">Sparar...</div>}

      {showModal && createPortal(
        <AddCardModal
          existingCount={cards.length}
          onAdd={handleAdd}
          onClose={() => setShowModal(false)}
        />,
        document.body
      )}
    </>
  );
}

/* ════════════════════════════════════════════
   Add Card Modal
   ════════════════════════════════════════════ */

const CARD_TYPES = [
  { type: "link", label: "Länk", description: "Öppnar en URL", icon: "🔗" },
  { type: "article", label: "Artikel", description: "Intern innehållssida", icon: "📄" },
  { type: "download", label: "Ladda ner", description: "PDF eller fil", icon: "⬇️" },
  { type: "gallery", label: "Galleri", description: "Bildgalleri", icon: "🖼️" },
] as const;

function AddCardModal({ existingCount, onAdd, onClose }: {
  existingCount: number;
  onAdd: (card: Card) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"type" | "form">("type");
  const [selectedType, setSelectedType] = useState<Card["type"] | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [badge, setBadge] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [url, setUrl] = useState("");
  const [openMode, setOpenMode] = useState<"internal" | "iframe" | "external">("external");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileType, setFileType] = useState("pdf");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/tenant/upload", { method: "POST", body: formData });
      if (res.ok) {
        const { url: uploadedUrl } = await res.json();
        setUrl(uploadedUrl);
      }
    } finally {
      setIsUploading(false);
    }
    e.target.value = "";
  }, []);

  const [imageUrl, setImageUrl] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleCoverUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/tenant/upload", { method: "POST", body: formData });
      if (res.ok) {
        const { url: uploadedUrl } = await res.json();
        setImageUrl(uploadedUrl);
      }
    } finally {
      setIsUploading(false);
    }
    e.target.value = "";
  }, []);

  const handleSubmit = useCallback(() => {
    if (!selectedType || !title.trim()) return;
    const base = {
      id: `card_${Date.now()}`,
      sortOrder: existingCount,
      isActive: true,
      title: title.trim(),
      description: description.trim(),
      image: imageUrl || undefined,
      badge: badge.trim() || undefined,
      ctaLabel: ctaLabel.trim() || undefined,
    };
    let card: Card;
    if (selectedType === "link") {
      card = { ...base, type: "link", url, openMode };
    } else if (selectedType === "article") {
      card = { ...base, type: "article", slug: slug || `article-${Date.now()}`, content };
    } else if (selectedType === "download") {
      card = { ...base, type: "download", fileUrl: fileUrl || url, fileType };
    } else {
      card = { ...base, type: "gallery", images: imageUrl ? [imageUrl] : [] };
    }
    onAdd(card);
  }, [selectedType, title, description, imageUrl, badge, ctaLabel, url, openMode, slug, content, fileUrl, fileType, existingCount, onAdd]);

  return (
    <>
      <div className="design-modal-backdrop" onClick={onClose} />
      <div className="design-modal" style={{ maxHeight: "80vh", overflowY: "auto" }}>
        <div className="design-modal-header">
          <span className="design-modal-title">
            {step === "type" ? "Välj korttyp" : "Konfigurera kort"}
          </span>
          <button type="button" className="design-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {step === "type" ? (
          <div style={{ display: "grid", gap: 8, padding: "4px 0" }}>
            {CARD_TYPES.map(({ type, label, description: desc, icon }) => (
              <button key={type} type="button"
                onClick={() => { setSelectedType(type); setStep("form"); }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                  border: "1.5px solid #eee", borderRadius: 12, background: "none",
                  cursor: "pointer", textAlign: "left", transition: "border-color 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#7F22FE")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#eee")}
              >
                <span style={{ fontSize: 24 }}>{icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{label}</div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{desc}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14, padding: "4px 0" }}>
            {/* Bas-fält */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Titel *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="t.ex. Aktiviteter"
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Beskrivning</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Kort beskrivning"
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Omslagsbild</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {imageUrl && <img src={imageUrl} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />}
                <button type="button" onClick={() => imageInputRef.current?.click()}
                  style={{ padding: "7px 14px", border: "1px solid #e0e0e0", borderRadius: 8, background: "none", cursor: "pointer", fontSize: 13, color: "#555" }}>
                  {isUploading ? "Laddar upp..." : imageUrl ? "Byt bild" : "+ Ladda upp"}
                </button>
                <input ref={imageInputRef} type="file" accept="image/*" onChange={handleCoverUpload} style={{ display: "none" }} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Badge (valfri)</label>
                <input value={badge} onChange={e => setBadge(e.target.value)} placeholder="t.ex. Populärt"
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Knapptext (valfri)</label>
                <input value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} placeholder="t.ex. Läs mer"
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
              </div>
            </div>

            {/* Typ-specifika fält */}
            {selectedType === "link" && (
              <>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>URL *</label>
                  <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..."
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Öppna som</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    {(["external", "iframe", "internal"] as const).map(mode => (
                      <button key={mode} type="button" onClick={() => setOpenMode(mode)}
                        style={{ padding: "7px 4px", border: `1.5px solid ${openMode === mode ? "#7F22FE" : "#e0e0e0"}`, borderRadius: 8, background: openMode === mode ? "#f5eeff" : "none", cursor: "pointer", fontSize: 12, fontWeight: 500, color: openMode === mode ? "#7F22FE" : "#555" }}>
                        {mode === "external" ? "Extern" : mode === "iframe" ? "Iframe" : "Intern"}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            {selectedType === "article" && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Innehåll</label>
                <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Skriv artikelns innehåll..."
                  rows={4} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, resize: "vertical", boxSizing: "border-box" }} />
              </div>
            )}
            {selectedType === "download" && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Fil-URL *</label>
                <input value={fileUrl} onChange={e => setFileUrl(e.target.value)} placeholder="https://...pdf"
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
              <button type="button" onClick={() => setStep("type")}
                style={{ padding: "9px 18px", border: "1px solid #e0e0e0", borderRadius: 8, background: "none", cursor: "pointer", fontSize: 13, color: "#555" }}>
                Tillbaka
              </button>
              <button type="button" onClick={handleSubmit} disabled={!title.trim()}
                style={{ padding: "9px 18px", border: "none", borderRadius: 8, background: title.trim() ? "#7F22FE" : "#e0e0e0", color: title.trim() ? "#fff" : "#aaa", cursor: title.trim() ? "pointer" : "default", fontSize: 13, fontWeight: 600 }}>
                Lägg till
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ════════════════════════════════════════════
   Cards Icon
   ════════════════════════════════════════════ */

function CardsIcon() {
  return (
    <div className="design-icon-box">
      <svg width="20" height="20" viewBox="0 0 256 256" fill="#999">
        <path d="M224,48H32A16,16,0,0,0,16,64V192a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V64A16,16,0,0,0,224,48Zm0,144H32V64H224V192ZM48,136a8,8,0,0,1,8-8H88a8,8,0,0,1,0,16H56A8,8,0,0,1,48,136Zm0,32a8,8,0,0,1,8-8H120a8,8,0,0,1,0,16H56A8,8,0,0,1,48,168Zm160-32a8,8,0,0,1-8,8H168a8,8,0,0,1,0-16h32A8,8,0,0,1,208,136Z"/>
      </svg>
    </div>
  );
}
