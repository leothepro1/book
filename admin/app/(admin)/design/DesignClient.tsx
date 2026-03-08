"use client";

import { createContext, useCallback, useContext, useState, useTransition, useRef } from "react";
import { createPortal } from "react-dom";
import { PreviewProvider, GuestPreviewFrame, usePreview } from "../_components/GuestPreview";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import type { BackgroundMode, GradientDirection, ThemeConfig } from "@/app/(guest)/_lib/theme/types";
import { backgroundStyle } from "@/app/(guest)/_lib/theme/background";
import { useDraftUpdate } from "../_hooks/useDraftUpdate";
import { useUpload } from "../_hooks/useUpload";
import { ColorPickerPopup } from "../_components/ColorPicker";
import { ImageUpload } from "../_components/ImageUpload";
import { PublishBarProvider, PublishBar, usePublishBar } from "../_components/PublishBar";
import { WalletCard } from "@/app/_lib/access-pass/WalletCard";
import type { CardDesignConfig, CardBackground } from "@/app/_lib/access-pass/card-design";
import "../_components/GuestPreview/preview.css";
import "./design.css";
import "../_components/admin-page.css";

/* ── Wallet Card Design Context ── */

interface WalletCardState {
  bgMode: BackgroundMode;
  bgColor: string;
  gradDirection: GradientDirection;
  bgImageUrl: string;
  overlayOpacity: number;
  logoUrl: string;
  dateColor: string;
}

const DEFAULT_WALLET_STATE: WalletCardState = {
  bgMode: "fill", bgColor: "#1a1a2e", gradDirection: "down",
  bgImageUrl: "", overlayOpacity: 0.3, logoUrl: "", dateColor: "#ffffff",
};

const WalletCardCtx = createContext<{
  state: WalletCardState;
  update: (patch: Partial<WalletCardState>) => void;
}>({ state: DEFAULT_WALLET_STATE, update: () => {} });

/* ── Types ── */

type DesignView = "main" | "colors" | "header" | "wallpaper" | "buttons" | "text" | "tiles" | "walletCard";

interface Props {
  initialConfig: TenantConfig;
}

/* ── Font Options ── */

import { FONT_CATALOG, batchFontsUrl } from "@/app/_lib/fonts/catalog";

const FONTS_PER_PAGE = 30;

const FONT_OPTIONS = FONT_CATALOG.map((f) => ({
  key: f.key,
  label: f.label,
  family: `${f.label}, ${f.serif ? "serif" : "sans-serif"}`,
}));

/** Pre-compute the initial batch URL (loaded with modal open) */
const INITIAL_BATCH_URL = batchFontsUrl(FONT_CATALOG.slice(0, FONTS_PER_PAGE));

/* ── Button Options ── */

type ButtonVariantOption = "solid" | "outline";
type ButtonRadiusOption = "square" | "rounded" | "round" | "rounder" | "full";

const VARIANT_OPTIONS: { key: ButtonVariantOption; label: string }[] = [
  { key: "solid", label: "Fylld" },
  { key: "outline", label: "Kontur" },
];

const RADIUS_OPTIONS: { key: ButtonRadiusOption; label: string; icon: React.ReactNode }[] = [
  { key: "square", label: "Skarp", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 20V4H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> },
  { key: "round", label: "Rund", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 20V6C4 4.89543 4.89543 4 6 4H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> },
  { key: "rounder", label: "Rundare", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 20V8C4 5.79086 5.79086 4 8 4H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> },
  { key: "full", label: "Helt rund", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 20V12C4 7.58172 7.58172 4 12 4H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> },
];

/* ── Tile Shadow Options ── */

type TileShadowOption = "none" | "soft" | "strong" | "hard";

const TILE_SHADOW_OPTIONS: { key: TileShadowOption; label: string }[] = [
  { key: "none", label: "Ingen" },
  { key: "soft", label: "Mjuk" },
  { key: "strong", label: "Medium" },
  { key: "hard", label: "Stark" },
];

/* ── Color Fields Config ── */

type ColorKey = "background" | "buttonBg" | "buttonText" | "text";

const COLOR_FIELDS: { key: ColorKey; label: string }[] = [
  { key: "background", label: "Bakgrund" },
  { key: "buttonBg", label: "Knappar" },
  { key: "buttonText", label: "Knapptext" },
  { key: "text", label: "Sidtext" },
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
   Design Inner (publish bar + views)
   ════════════════════════════════════════════ */

function DesignInner() {
  const { config } = usePreview();
  const getConfig = useCallback(() => config, [config]);

  return (
    <PublishBarProvider getConfig={getConfig}>
      <DesignInnerContent />
    </PublishBarProvider>
  );
}

function DesignInnerContent() {
  const { pushUndo } = usePublishBar();
  const [activeView, setActiveView] = useState<DesignView>("main");
  const [walletState, setWalletState] = useState<WalletCardState>(DEFAULT_WALLET_STATE);

  const updateWallet = useCallback((patch: Partial<WalletCardState>) => {
    setWalletState((prev) => ({ ...prev, ...patch }));
  }, []);

  return (
    <WalletCardCtx.Provider value={{ state: walletState, update: updateWallet }}>
      <div className="admin-page">
        <div className="admin-editor">
          <div className="admin-header">
            <h1 className="admin-title">Design</h1>
            <PublishBar />
          </div>
          <div className="admin-content">
            <DesignViewManager pushUndo={pushUndo} onViewChange={setActiveView} />
          </div>
        </div>
        <div className="admin-preview">
          {activeView === "walletCard" ? (
            <WalletCardPreviewPanel />
          ) : (
            <GuestPreviewFrame route="/p/[token]" className="preview-widget-sticky" />
          )}
        </div>
      </div>
    </WalletCardCtx.Provider>
  );
}

/* ════════════════════════════════════════════
   View Manager
   ════════════════════════════════════════════ */

function DesignViewManager({ pushUndo, onViewChange }: { pushUndo: (s: Partial<TenantConfig>) => void; onViewChange?: (v: DesignView) => void }) {
  const [currentView, setCurrentView] = useState<DesignView>("main");
  const [previousView, setPreviousView] = useState<DesignView | null>(null);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const hasNavigated = useRef(false);

  const navigateTo = useCallback((view: DesignView) => {
    if (isTransitioning) return;
    hasNavigated.current = true;
    setIsTransitioning(true);
    setDirection("forward");
    setPreviousView(currentView);
    onViewChange?.(view);
    requestAnimationFrame(() => {
      setTimeout(() => { setCurrentView(view); setPreviousView(null); setTimeout(() => setIsTransitioning(false), 500); }, 300);
    });
  }, [currentView, isTransitioning, onViewChange]);

  const navigateBack = useCallback(() => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setDirection("back");
    setPreviousView(currentView);
    onViewChange?.("main");
    requestAnimationFrame(() => {
      setTimeout(() => { setCurrentView("main"); setPreviousView(null); setTimeout(() => setIsTransitioning(false), 500); }, 300);
    });
  }, [currentView, isTransitioning, onViewChange]);

  const exitClass = direction === "forward" ? "design-view-exit-left" : "design-view-exit-right";
  const enterClass = (direction === "forward" ? "design-view-enter-right" : "design-view-enter-left") + (hasNavigated.current ? " design-view-fast" : "");
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
        ) : activeView === "wallpaper" ? (
          <WallpaperView onBack={navigateBack} pushUndo={pushUndo} />
        ) : activeView === "tiles" ? (
          <TilesView onBack={navigateBack} pushUndo={pushUndo} />
        ) : activeView === "walletCard" ? (
          <WalletCardView onBack={navigateBack} />
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

  const bgLabel = theme?.background?.mode === "gradient" ? "Gradient" : theme?.background?.mode === "image" ? "Bild" : "Enfärgad";
  const btnLabel = theme?.buttons?.variant === "outline" ? "Kontur" : "Fylld";
  const fontLabel = FONT_OPTIONS.find(f => f.key === theme?.typography?.headingFont)?.label || "Inter";

  return (
    <>
      <div className="design-section">
        <div className="design-section-header"><span className="design-section-label design-stagger-item">Tema</span></div>
        <DesignRow icon={<ThemeIcon />} label="" value="Anpassat" onClick={() => onNavigate("walletCard")} className="design-stagger-item design-row--theme" />
      </div>
      <div className="design-section">
        <div className="design-section-header"><span className="design-section-label design-stagger-item">Anpassa tema</span></div>
        <DesignRow icon={<HeaderIcon logoUrl={theme?.header?.logoUrl} bg={theme?.background} bgColor={theme?.colors?.background} />} label="Logotyp" value={theme?.header?.logoUrl ? "Logotyp uppladdad" : "Ingen logotyp"} onClick={() => onNavigate("header")} className="design-stagger-item" />
        <DesignRow icon={<WallpaperIcon bg={theme?.background} bgColor={theme?.colors?.background} />} label="Bakgrund" value={bgLabel} onClick={() => onNavigate("wallpaper")} className="design-stagger-item" />
        <DesignRow icon={<ButtonsIcon variant={theme?.buttons?.variant} color={theme?.colors?.buttonBg} radius={theme?.buttons?.radius} />} label="Knappar" value={btnLabel} onClick={() => onNavigate("buttons")} className="design-stagger-item" />
        <DesignRow icon={<TextIcon font={theme?.typography?.headingFont} />} label="Typsnitt" value={fontLabel} onClick={() => onNavigate("text")} className="design-stagger-item" />
        <DesignRow icon={<ColorsIcon bg={theme?.colors?.background} accent={theme?.colors?.buttonBg} />} label="Färger" onClick={() => onNavigate("colors")} className="design-stagger-item" />
        <DesignRow icon={<TilesIcon bg={theme?.tiles?.background} radius={theme?.tiles?.radius} />} label="Snabblänkar" value={theme?.tiles?.background?.toUpperCase() || "#F1F0EE"} onClick={() => onNavigate("tiles")} className="design-stagger-item" />
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const swatchRef = useRef<HTMLDivElement>(null);
  return (
    <div className={"design-color-field " + className}>
      <span className="design-field-label">{label}</span>
      <div className="design-color-input-row">
        <input type="text" value={value.toUpperCase()} onChange={(e) => onChange(e.target.value)} className="design-color-input" spellCheck={false} autoComplete="off" />
        <div ref={swatchRef} className="design-color-swatch" style={{ background: value }} onClick={() => setPickerOpen(!pickerOpen)} />
        {pickerOpen && (
          <ColorPickerPopup
            value={value}
            onChange={onPickerChange}
            onClose={() => setPickerOpen(false)}
            anchorRef={swatchRef}
          />
        )}
      </div>
    </div>
  );
}

function useColorEditor(pushUndo: (s: Partial<TenantConfig>) => void, snapshotFn: () => Partial<TenantConfig>, themeColors: any) {
  const [isPending, startTransition] = useTransition();
  const saveDraft = useDraftUpdate();
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [localColors, setLocalColors] = useState<Record<string, string>>({});

  const getColor = (key: string): string => localColors[key] || themeColors?.[key] || "#FFFFFF";

  const saveColor = useCallback((key: string, value: string) => {
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(() => {
      pushUndo(snapshotFn());
      startTransition(async () => {
        const result = await saveDraft({ theme: { colors: { [key]: value } } } as any);
        if (!result.success) console.error("[Color] Save failed:", result.error);
      });
    }, 500);
  }, [pushUndo, snapshotFn, saveDraft]);

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
      <BackButton label="Färger" onClick={onBack} />
      <div className="design-color-fields">
        {COLOR_FIELDS.map(({ key, label }) => (
          <ColorField key={key} label={label} value={getColor(key)} onChange={(v) => handleChange(key, v)} onPickerChange={(v) => handlePicker(key, v)} className="design-stagger-item" />
        ))}
      </div>
          </>
  );
}

/* ════════════════════════════════════════════
   Header View
   ════════════════════════════════════════════ */

function HeaderView({ onBack, pushUndo }: { onBack: () => void; pushUndo: (s: Partial<TenantConfig>) => void }) {
  const { config } = usePreview();
  const saveDraft = useDraftUpdate();
  const theme = config?.theme;
  const [isPending, startTransition] = useTransition();
  const [showLogoModal, setShowLogoModal] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { upload, isUploading } = useUpload("hospitality/logos");

  const currentLogoUrl = previewUrl || theme?.header?.logoUrl || "";
  const currentLogoWidth = theme?.header?.logoWidth ?? 120;
  const [localWidth, setLocalWidth] = useState<number>(currentLogoWidth);
  const widthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prevWidth = useRef(currentLogoWidth);
  if (currentLogoWidth !== prevWidth.current) { prevWidth.current = currentLogoWidth; setLocalWidth(currentLogoWidth); }

  const snapshotHeader = useCallback(() => ({ theme: { header: { ...theme?.header } } } as Partial<TenantConfig>), [theme?.header]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    pushUndo(snapshotHeader());
    await upload(
      file,
      (localUrl) => setPreviewUrl(localUrl),
      (result) => {
        setPreviewUrl(null);
        startTransition(async () => {
          await saveDraft({ theme: { header: { logoUrl: result.url } } } as any);
        });
      },
    );
  }, [pushUndo, snapshotHeader, saveDraft, upload]);

  const handleWidthChange = useCallback((value: number) => {
    setLocalWidth(value);
    if (widthTimerRef.current) clearTimeout(widthTimerRef.current);
    widthTimerRef.current = setTimeout(() => {
      pushUndo(snapshotHeader());
      startTransition(async () => {
        await saveDraft({ theme: { header: { logoWidth: value } } } as any);
      });
    }, 300);
  }, [pushUndo, snapshotHeader, saveDraft]);

  const handleRemoveLogo = useCallback(async () => {
    if (isRemoving) return;
    setIsRemoving(true);
    pushUndo(snapshotHeader());
    const result = await saveDraft({ theme: { header: { logoUrl: "" } } } as any);
    if (!result.success) console.error("[Header] Remove failed:", result.error);
    setIsRemoving(false);
    setShowLogoModal(false);
  }, [isRemoving, pushUndo, snapshotHeader, saveDraft]);

  const handleEditClick = useCallback(() => {
    if (currentLogoUrl) {
      setShowLogoModal(true);
    } else {
      fileInputRef.current?.click();
    }
  }, [currentLogoUrl]);

  return (
    <>
      <BackButton label="Logotyp" onClick={onBack} />

      <div className="design-field-group design-stagger-item">
        <span className="design-field-label">Logotyp</span>
        <div className="design-logo-upload">
          <div className={"design-logo-avatar " + (isUploading ? "design-logo-shimmer" : "")}>
            {currentLogoUrl && !isUploading ? (
              <img src={currentLogoUrl} alt="Logotyp" className="design-logo-img" />
            ) : !isUploading ? (
              <svg className="design-logo-placeholder" viewBox="0 0 145 144" fill="none" xmlns="http://www.w3.org/2000/svg"><g clipPath="url(#clip0_logo)"><rect width="145" height="146" fill="#A8AAA2" /><circle cx="72.396" cy="53.896" r="31.396" fill="#F6F7F5" /><ellipse cx="72.5" cy="150.5" rx="63.5" ry="59" fill="#F6F7F5" /></g><defs><clipPath id="clip0_logo"><rect width="145" height="146" fill="white" /></clipPath></defs></svg>
            ) : null}
          </div>
          <button type="button" className={"design-logo-btn " + (currentLogoUrl ? "design-logo-btn-edit" : "")} onClick={handleEditClick}>
            {currentLogoUrl ? (
              <><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z" /></svg><span>Ändra</span></>
            ) : (
              <><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z" /></svg><span>Ladda upp</span></>
            )}
          </button>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" onChange={handleUpload} className="design-file-hidden" aria-hidden="true" />
        </div>
      </div>

      <div className="design-field-group design-stagger-item">
        <span className="design-field-label">Bredd på logotyp</span>
        <div className="design-slider-row">
          <DesignSlider min={40} max={300} step={1} value={localWidth} onChange={(e) => handleWidthChange(Number(e.target.value))} />
          <div className="design-slider-input-wrap">
            <input type="number" min={40} max={300} value={localWidth} onChange={(e) => handleWidthChange(Math.min(300, Math.max(40, Number(e.target.value) || 40)))} className="design-slider-input" />
            <span className="design-slider-unit">px</span>
          </div>
        </div>
      </div>

      
      {showLogoModal && createPortal(
        <>
          <div className="design-modal-backdrop" onClick={() => setShowLogoModal(false)} />
          <div className="design-modal design-modal-sm">
            <button type="button" className="design-logo-modal-btn design-logo-modal-primary" onClick={() => { setShowLogoModal(false); fileInputRef.current?.click(); }}>Ändra logotyp</button>
            <button type="button" className="design-logo-modal-btn design-logo-modal-danger" onClick={handleRemoveLogo} disabled={isRemoving}>
              {isRemoving && <SpinnerIcon />}
              <span>Ta bort logotyp</span>
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
  const saveDraft = useDraftUpdate();
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
      await saveDraft({ theme: { buttons: { [prop]: value } } } as any);
    });
  }, [pushUndo, snapshotButtons, saveDraft]);

  return (
    <>
      <BackButton label="Knappar" onClick={onBack} />

      <div className="design-field-group design-stagger-item">
        <span className="design-field-label">Knappstil</span>
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
        <span className="design-field-label">Hörnrundning</span>
        <div className="design-toggle-row design-toggle-4col">
          {RADIUS_OPTIONS.map(({ key, label, icon }) => (
            <button key={key} type="button" className={"design-toggle-card " + (currentRadius === key ? "design-toggle-active" : "")} onClick={() => saveButtonProp("radius", key)}>
              <div className="design-toggle-icon">{icon}</div>
              <span className="design-toggle-label">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <ColorField label="Knappfärg" value={getColor("buttonBg")} onChange={(v) => handleChange("buttonBg", v)} onPickerChange={(v) => handlePicker("buttonBg", v)} className="design-stagger-item" />
      <ColorField label="Knapptextfärg" value={getColor("buttonText")} onChange={(v) => handleChange("buttonText", v)} onPickerChange={(v) => handlePicker("buttonText", v)} className="design-stagger-item" />

          </>
  );
}

/* ════════════════════════════════════════════
   Text View
   ════════════════════════════════════════════ */

function TextView({ onBack, pushUndo }: { onBack: () => void; pushUndo: (s: Partial<TenantConfig>) => void }) {
  const { config } = usePreview();
  const saveDraft = useDraftUpdate();
  const theme = config?.theme;
  const [showModal, setShowModal] = useState<"heading" | "body" | "button" | null>(null);
  const [isPending, startTransition] = useTransition();

  const headingFont = theme?.typography?.headingFont || "inter";
  const headingLabel = FONT_OPTIONS.find(f => f.key === headingFont)?.label || "Inter";
  const headingFamily = FONT_OPTIONS.find(f => f.key === headingFont)?.family || "Inter, sans-serif";

  const bodyFont = theme?.typography?.bodyFont || headingFont;
  const bodyLabel = FONT_OPTIONS.find(f => f.key === bodyFont)?.label || headingLabel;
  const bodyFamily = FONT_OPTIONS.find(f => f.key === bodyFont)?.family || headingFamily;

  const buttonFont = theme?.typography?.buttonFont;
  const hasCustomButtonFont = !!buttonFont;
  const buttonFontLabel = buttonFont ? (FONT_OPTIONS.find(f => f.key === buttonFont)?.label || headingLabel) : headingLabel;
  const buttonFontFamily = buttonFont ? (FONT_OPTIONS.find(f => f.key === buttonFont)?.family || headingFamily) : headingFamily;

  const snapshotTypography = useCallback(() => ({ theme: { typography: { ...theme?.typography }, colors: { ...theme?.colors } } } as Partial<TenantConfig>), [theme?.typography, theme?.colors]);
  const { getColor, handleChange, handlePicker, isPending: colorPending } = useColorEditor(pushUndo, snapshotTypography, theme?.colors);

  const handleFontSelect = useCallback((fontKey: string) => {
    const target = showModal;
    pushUndo(snapshotTypography());
    setShowModal(null);
    startTransition(async () => {
      if (target === "heading") {
        await saveDraft({ theme: { typography: { headingFont: fontKey } } } as any);
      } else if (target === "body") {
        await saveDraft({ theme: { typography: { bodyFont: fontKey } } } as any);
      } else if (target === "button") {
        await saveDraft({ theme: { typography: { buttonFont: fontKey } } } as any);
      }
    });
  }, [showModal, pushUndo, snapshotTypography, saveDraft]);

  const handleButtonFontToggle = useCallback(() => {
    pushUndo(snapshotTypography());
    startTransition(async () => {
      if (hasCustomButtonFont) {
        // Turn off: clear buttonFont (inherit heading)
        await saveDraft({ theme: { typography: { buttonFont: null } } } as any);
      } else {
        // Turn on: set buttonFont to current heading font as starting point
        await saveDraft({ theme: { typography: { buttonFont: headingFont } } } as any);
      }
    });
  }, [hasCustomButtonFont, headingFont, pushUndo, snapshotTypography, saveDraft]);

  return (
    <>
      <BackButton label="Typsnitt" onClick={onBack} />

      <div className="design-field-group design-stagger-item">
        <span className="design-field-label">Titeltypsnitt</span>
        <button type="button" className="design-font-selector" onClick={() => setShowModal("heading")}>
          <span className="design-font-selector-name" style={{ fontFamily: headingFamily }}>{headingLabel}</span>
          <ChevronRight />
        </button>
      </div>

      <div className="design-field-group design-stagger-item">
        <span className="design-field-label">Brödtypsnitt</span>
        <button type="button" className="design-font-selector" onClick={() => setShowModal("body")}>
          <span className="design-font-selector-name" style={{ fontFamily: bodyFamily }}>{bodyLabel}</span>
          <ChevronRight />
        </button>
      </div>

      <div className="design-field-group design-stagger-item">
        <div className="design-switch-row">
          <div>
            <span className="design-field-label">Eget knapptypsnitt</span>
            <span className="design-field-hint">Knappar ärver titeltypsnitt som standard</span>
          </div>
          <button type="button" role="switch" aria-checked={hasCustomButtonFont} onClick={handleButtonFontToggle}
            className={"admin-toggle" + (hasCustomButtonFont ? " admin-toggle-on" : "")}>
            <span className="admin-toggle-thumb" />
          </button>
        </div>
        {hasCustomButtonFont && (
          <button type="button" className="design-font-selector" onClick={() => setShowModal("button")}>
            <span className="design-font-selector-name" style={{ fontFamily: buttonFontFamily }}>{buttonFontLabel}</span>
            <ChevronRight />
          </button>
        )}
      </div>

      <ColorField label="Sidtextfärg" value={getColor("text")} onChange={(v) => handleChange("text", v)} onPickerChange={(v) => handlePicker("text", v)} className="design-stagger-item" />
      <ColorField label="Titelfärg" value={getColor("buttonBg")} onChange={(v) => handleChange("buttonBg", v)} onPickerChange={(v) => handlePicker("buttonBg", v)} className="design-stagger-item" />

      
      {showModal && createPortal(
        <FontPickerModal
          currentFont={showModal === "heading" ? headingFont : showModal === "body" ? bodyFont : (buttonFont || headingFont)}
          onSelect={handleFontSelect}
          onClose={() => setShowModal(null)}
        />,
        document.body
      )}
    </>
  );
}

/* ── Font Picker Modal (paginated) ── */

function FontPickerModal({ currentFont, onSelect, onClose }: {
  currentFont: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(FONTS_PER_PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  // Track which URLs are already loaded (initial batch is loaded via JSX <link>)
  const loadedUrlsRef = useRef<Set<string>>(new Set(INITIAL_BATCH_URL ? [INITIAL_BATCH_URL] : []));

  const isSearching = search.trim().length > 0;

  // When searching: show ALL matching fonts (load their CSS). When browsing: paginate.
  const searchResults = isSearching
    ? FONT_OPTIONS.filter(f => f.label.toLowerCase().includes(search.trim().toLowerCase()))
    : null;

  const displayFonts = searchResults ?? FONT_OPTIONS.slice(0, visibleCount);
  const hasMore = !isSearching && visibleCount < FONT_OPTIONS.length;

  // Load CSS for search results that haven't been loaded yet
  const loadFontsForSearch = useCallback((fonts: typeof FONT_OPTIONS) => {
    const catalogEntries = fonts.map(f => FONT_CATALOG.find(c => c.key === f.key)!).filter(Boolean);
    const url = batchFontsUrl(catalogEntries);
    if (!url || loadedUrlsRef.current.has(url)) return;
    loadedUrlsRef.current.add(url);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
  }, []);

  // When search results change, ensure their fonts are loaded
  if (searchResults && searchResults.length > 0) {
    loadFontsForSearch(searchResults);
  }

  const handleShowMore = useCallback(() => {
    setLoadingMore(true);

    // Pre-load the next batch CSS, then reveal after fonts start loading
    const nextEnd = Math.min(visibleCount + FONTS_PER_PAGE, FONT_CATALOG.length);
    const batch = FONT_CATALOG.slice(visibleCount, nextEnd);
    const url = batchFontsUrl(batch);

    if (url && !loadedUrlsRef.current.has(url)) {
      loadedUrlsRef.current.add(url);
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;

      link.onload = () => {
        setVisibleCount(nextEnd);
        setLoadingMore(false);
      };
      link.onerror = () => {
        setVisibleCount(nextEnd);
        setLoadingMore(false);
      };

      document.head.appendChild(link);
    } else {
      setVisibleCount(nextEnd);
      setLoadingMore(false);
    }
  }, [visibleCount]);

  return (
    <>
      {INITIAL_BATCH_URL && <link rel="stylesheet" href={INITIAL_BATCH_URL} />}
      <div className="design-modal-backdrop" onClick={onClose} />
      <div className="design-modal">
        <div className="design-modal-header">
          <div className="design-modal-header-top">
            <span className="design-modal-title">Typsnitt</span>
            <button type="button" className="design-modal-close" onClick={onClose} aria-label="Stäng">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="design-modal-search">
            <svg className="design-modal-search-icon" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              ref={searchRef}
              type="text"
              className="design-modal-search-input"
              placeholder="Sök efter typsnitt"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="design-modal-grid">
          {displayFonts.map(({ key, label, family }) => (
            <button key={key} type="button" className={"design-font-option " + (currentFont === key ? "design-font-option-active" : "")} onClick={() => onSelect(key)} style={{ fontFamily: family }}>
              {label}
            </button>
          ))}
          {isSearching && displayFonts.length === 0 && (
            <div className="design-modal-empty">Inga typsnitt hittades</div>
          )}
          {hasMore && (
            <div className="design-modal-load-more">
              <button
                type="button"
                className="design-show-more-btn"
                onClick={handleShowMore}
                disabled={loadingMore}
              >
                {loadingMore && (
                  <svg className="design-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" opacity="0.3" />
                    <path d="M12 2v4" />
                  </svg>
                )}
                Visa fler
              </button>
              <span className="design-modal-count">Visar {visibleCount} av {FONT_OPTIONS.length}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════
   Wallpaper View
   ════════════════════════════════════════════ */

const BG_MODES: { key: BackgroundMode; label: string }[] = [
  { key: "fill", label: "Enfärgad" },
  { key: "gradient", label: "Gradient" },
  { key: "image", label: "Bild" },
];

const GRADIENT_DIRS: { key: GradientDirection; label: string }[] = [
  { key: "down", label: "Uppåt → Ner" },
  { key: "up", label: "Ner → Upp" },
];


function WallpaperView({ onBack, pushUndo }: { onBack: () => void; pushUndo: (s: Partial<TenantConfig>) => void }) {
  const { config } = usePreview();
  const saveDraft = useDraftUpdate();
  const theme = config?.theme;
  const bg: ThemeConfig["background"] = theme?.background || { mode: "fill" };
  const [isPending, startTransition] = useTransition();

  const snapshot = useCallback(() => ({ theme: { background: { ...bg }, colors: { ...theme?.colors } } } as Partial<TenantConfig>), [bg, theme?.colors]);

  // Background color (colors.background) — editable from wallpaper view
  const { getColor: getBgColor, handleChange: _bgChange, handlePicker: _bgPicker } = useColorEditor(pushUndo, snapshot, theme?.colors);
  const bgColor = getBgColor("background");
  const handleBgColorChange = useCallback((v: string) => _bgChange("background", v), [_bgChange]);
  const handleBgColorPicker = useCallback((v: string) => _bgPicker("background", v), [_bgPicker]);

  const saveBg = useCallback((changes: Partial<ThemeConfig["background"]>) => {
    pushUndo(snapshot());
    startTransition(async () => {
      await saveDraft({ theme: { background: { ...bg, ...changes } } } as any);
    });
  }, [bg, pushUndo, snapshot, saveDraft]);

  const saveMode = useCallback((mode: BackgroundMode) => {
    pushUndo(snapshot());
    const base: ThemeConfig["background"] = { mode };
    if (mode === "gradient") {
      base.gradientDirection = bg.gradientDirection || "down";
    } else if (mode === "image") {
      base.imageUrl = bg.imageUrl;
      base.overlayOpacity = bg.overlayOpacity ?? 0.3;
    }
    startTransition(async () => {
      await saveDraft({ theme: { background: base } } as any);
    });
  }, [bg, theme?.colors, pushUndo, snapshot, saveDraft]);


  const handleImageChange = useCallback((url: string) => {
    saveBg({ imageUrl: url });
  }, [saveBg]);

  const handleImageRemove = useCallback(() => {
    saveBg({ imageUrl: undefined });
  }, [saveBg]);

  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localOverlay, setLocalOverlay] = useState(bg.overlayOpacity ?? 0.3);
  const prevOverlay = useRef(bg.overlayOpacity);
  if (bg.overlayOpacity !== prevOverlay.current) { prevOverlay.current = bg.overlayOpacity; setLocalOverlay(bg.overlayOpacity ?? 0.3); }

  const handleOverlayChange = useCallback((value: number) => {
    setLocalOverlay(value);
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = setTimeout(() => saveBg({ overlayOpacity: value }), 200);
  }, [saveBg]);

  return (
    <>
      <BackButton label="Bakgrund" onClick={onBack} />

      {/* Mode selector */}
      <div className="design-field-group design-stagger-item">
        <span className="design-field-label">Bakgrundstyp</span>
        <div className="design-toggle-row design-toggle-3col">
          {BG_MODES.map(({ key, label }) => {
            const previewStyle = wallpaperPreviewStyle(key, bgColor, bg);
            return (
              <button key={key} type="button" className={"design-toggle-card " + (bg.mode === key ? "design-toggle-active" : "")} onClick={() => saveMode(key)}>
                <div className="design-toggle-icon design-toggle-icon--preview" style={previewStyle}>
                  {key === "image" && !bg.imageUrl && (
                    <svg width="20" height="20" viewBox="0 0 256 256" fill="#bbb" style={{ opacity: 0.6 }}>
                      <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM176,88a16,16,0,1,1-16-16A16,16,0,0,1,176,88Z" />
                    </svg>
                  )}
                </div>
                <span className="design-toggle-label">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Background color — shared by fill and gradient */}
      {(bg.mode === "fill" || bg.mode === "gradient") && (
        <ColorField label="Färg" value={bgColor} onChange={(v) => handleBgColorChange(v)} onPickerChange={(v) => handleBgColorPicker(v)} />
      )}

      {/* Gradient options */}
      {bg.mode === "gradient" && (
        <>
          <div className="design-field-group">
            <span className="design-field-label">Riktning</span>
            <div className="design-toggle-row design-toggle-2col">
              {GRADIENT_DIRS.map(({ key, label }) => (
                <button key={key} type="button" className={"design-toggle-card " + ((bg.gradientDirection || "down") === key ? "design-toggle-active" : "")} onClick={() => saveBg({ gradientDirection: key })}>
                  <div className="design-toggle-icon">
                    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      {key === "down" ? <path d="M12 5v14M19 12l-7 7-7-7" /> : <path d="M12 19V5M5 12l7-7 7 7" />}
                    </svg>
                  </div>
                  <span className="design-toggle-label">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Image options */}
      {bg.mode === "image" && (
        <>
          <div className="design-field-group">
            <span className="design-field-label">Bakgrundsbild</span>
            <ImageUpload
              value={bg.imageUrl}
              onChange={handleImageChange}
              onRemove={handleImageRemove}
              folder="hospitality/wallpaper"
              placeholder="Välj bakgrundsbild..."
            />
          </div>

          <div className="design-field-group">
            <span className="design-field-label">Mörkläggning</span>
            <div className="design-slider-row">
              <DesignSlider min={0} max={80} step={1} value={Math.round(localOverlay * 100)} onChange={(e) => handleOverlayChange(Number(e.target.value) / 100)} />
              <div className="design-slider-input-wrap">
                <input type="number" min={0} max={80} value={Math.round(localOverlay * 100)} onChange={(e) => handleOverlayChange(Math.min(0.8, Math.max(0, Number(e.target.value) / 100)))} className="design-slider-input" />
                <span className="design-slider-unit">%</span>
              </div>
            </div>
          </div>
        </>
      )}

          </>
  );
}

function wallpaperPreviewStyle(
  mode: BackgroundMode,
  bgColor: string,
  bg: ThemeConfig["background"],
): React.CSSProperties {
  const colors = { background: bgColor, text: "", buttonBg: "", buttonText: "" };
  switch (mode) {
    case "fill":
      return { background: bgColor };
    case "gradient":
      return backgroundStyle(
        { mode: "gradient", gradientDirection: bg.gradientDirection || "down" },
        colors,
      );
    case "image": {
      if (!bg.imageUrl) return {};
      return backgroundStyle(
        { mode: "image", imageUrl: bg.imageUrl, overlayOpacity: bg.overlayOpacity },
        colors,
      );
    }
    default:
      return {};
  }
}

/* ════════════════════════════════════════════
   Tiles View (Snabblänkar)
   ════════════════════════════════════════════ */

function TilesView({ onBack, pushUndo }: { onBack: () => void; pushUndo: (s: Partial<TenantConfig>) => void }) {
  const { config } = usePreview();
  const saveDraft = useDraftUpdate();
  const theme = config?.theme;
  const [isPending, startTransition] = useTransition();

  const currentRadius = theme?.tiles?.radius || "round";
  const currentShadow = theme?.tiles?.shadow || "none";

  const snapshotTiles = useCallback(() => ({ theme: { tiles: { ...theme?.tiles } } } as Partial<TenantConfig>), [theme?.tiles]);

  // Color editor for tile background
  const tileColors = { background: theme?.tiles?.background || "#F1F0EE" };
  const [localBg, setLocalBg] = useState(tileColors.background);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prevBg = useRef(tileColors.background);
  if (tileColors.background !== prevBg.current) { prevBg.current = tileColors.background; setLocalBg(tileColors.background); }

  const saveTileBg = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushUndo(snapshotTiles());
      startTransition(async () => {
        await saveDraft({ theme: { tiles: { background: value, radius: currentRadius, shadow: currentShadow } } } as any);
      });
    }, 500);
  }, [pushUndo, snapshotTiles, saveDraft, currentRadius, currentShadow]);

  const handleBgChange = useCallback((value: string) => {
    let n = value.trim();
    if (n && !n.startsWith("#")) n = "#" + n;
    setLocalBg(n);
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(n)) saveTileBg(n);
  }, [saveTileBg]);

  const handleBgPicker = useCallback((value: string) => {
    setLocalBg(value);
    saveTileBg(value);
  }, [saveTileBg]);

  const saveTileProp = useCallback((prop: string, value: string) => {
    pushUndo(snapshotTiles());
    startTransition(async () => {
      await saveDraft({ theme: { tiles: { ...theme?.tiles, background: theme?.tiles?.background || "#F1F0EE", radius: theme?.tiles?.radius || "round", shadow: theme?.tiles?.shadow || "none", [prop]: value } } } as any);
    });
  }, [pushUndo, snapshotTiles, saveDraft, theme?.tiles]);

  return (
    <>
      <BackButton label="Snabblänkar" onClick={onBack} />

      <ColorField label="Bakgrundsfärg" value={localBg.toUpperCase()} onChange={handleBgChange} onPickerChange={handleBgPicker} className="design-stagger-item" />

      <div className="design-field-group design-stagger-item">
        <span className="design-field-label">Hörnrundning</span>
        <div className="design-toggle-row design-toggle-4col">
          {RADIUS_OPTIONS.map(({ key, label, icon }) => (
            <button key={key} type="button" className={"design-toggle-card " + (currentRadius === key ? "design-toggle-active" : "")} onClick={() => saveTileProp("radius", key)}>
              <div className="design-toggle-icon">{icon}</div>
              <span className="design-toggle-label">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="design-field-group design-stagger-item">
        <span className="design-field-label">Skugga</span>
        <div className="design-toggle-row design-toggle-4col">
          {TILE_SHADOW_OPTIONS.map(({ key, label }) => (
            <button key={key} type="button" className={"design-toggle-card " + (currentShadow === key ? "design-toggle-active" : "")} onClick={() => saveTileProp("shadow", key)}>
              <div className="design-toggle-icon">
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: "#D7D4CE",
                  boxShadow: key === "none" ? "none" : key === "soft" ? "0 1px 3px rgba(0,0,0,0.15)" : key === "strong" ? "0 4px 12px rgba(0,0,0,0.2)" : "0 8px 24px rgba(0,0,0,0.25)",
                }} />
              </div>
              <span className="design-toggle-label">{label}</span>
            </button>
          ))}
        </div>
      </div>

          </>
  );
}

/* ════════════════════════════════════════════
   Wallet Card View (Check-in kort) — editor panel
   ════════════════════════════════════════════ */

function WalletCardView({ onBack }: { onBack: () => void }) {
  const { state, update } = useContext(WalletCardCtx);
  const { bgMode, bgColor, gradDirection, bgImageUrl, overlayOpacity, logoUrl, dateColor } = state;
  const [isSaving, startSave] = useTransition();

  // Load existing design on mount
  const [loaded, setLoaded] = useState(false);
  const loadDesign = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet-card-design");
      if (res.ok) {
        const data = await res.json();
        const patch: Partial<WalletCardState> = {};
        if (data.backgroundMode === "SOLID") patch.bgMode = "fill";
        else if (data.backgroundMode === "GRADIENT") patch.bgMode = "gradient";
        else if (data.backgroundMode === "IMAGE") patch.bgMode = "image";
        if (data.backgroundColor) patch.bgColor = data.backgroundColor;
        if (data.backgroundGradientFrom) patch.bgColor = data.backgroundGradientFrom;
        if (data.gradientDirection) patch.gradDirection = data.gradientDirection;
        if (data.backgroundImageUrl) patch.bgImageUrl = data.backgroundImageUrl;
        if (data.overlayOpacity != null) patch.overlayOpacity = data.overlayOpacity;
        if (data.logoUrl) patch.logoUrl = data.logoUrl;
        if (data.dateTextColor) patch.dateColor = data.dateTextColor;
        update(patch);
      }
    } catch { /* use defaults */ }
    setLoaded(true);
  }, [update]);

  useState(() => { loadDesign(); });

  // Save to API
  const saveRef = useRef(state);
  saveRef.current = state;

  const save = useCallback(() => {
    const s = saveRef.current;
    const modeMap = { fill: "SOLID", gradient: "GRADIENT", image: "IMAGE" } as const;
    startSave(async () => {
      await fetch("/api/wallet-card-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backgroundMode: modeMap[s.bgMode],
          backgroundColor: s.bgMode === "fill" ? s.bgColor : null,
          backgroundGradientFrom: s.bgMode === "gradient" ? s.bgColor : null,
          backgroundGradientTo: null,
          backgroundGradientAngle: null,
          gradientDirection: s.bgMode === "gradient" ? s.gradDirection : null,
          backgroundImageUrl: s.bgMode === "image" ? s.bgImageUrl : null,
          overlayOpacity: s.bgMode === "image" ? s.overlayOpacity : null,
          logoUrl: s.logoUrl || null,
          dateTextColor: s.dateColor,
        }),
      });
    });
  }, []);

  // Auto-save on change (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 600);
  }, [save]);

  // Helpers to update + trigger save
  const set = useCallback((patch: Partial<WalletCardState>) => {
    update(patch);
    triggerSave();
  }, [update, triggerSave]);

  // Build bg object for wallpaperPreviewStyle
  const bg: ThemeConfig["background"] = {
    mode: bgMode,
    gradientDirection: gradDirection,
    imageUrl: bgImageUrl || undefined,
    overlayOpacity,
  };

  // Color field (shared between fill and gradient, same as wallpaper)
  const [localBgColor, setLocalBgColor] = useState(bgColor);
  const prevBgColor = useRef(bgColor);
  if (bgColor !== prevBgColor.current) { prevBgColor.current = bgColor; setLocalBgColor(bgColor); }

  const colorDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleColorChange = useCallback((v: string) => {
    let n = v.trim();
    if (n && !n.startsWith("#")) n = "#" + n;
    setLocalBgColor(n);
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(n)) {
      if (colorDebounce.current) clearTimeout(colorDebounce.current);
      colorDebounce.current = setTimeout(() => set({ bgColor: n }), 500);
    }
  }, [set]);
  const handleColorPicker = useCallback((v: string) => {
    setLocalBgColor(v);
    set({ bgColor: v });
  }, [set]);

  const handleImageChange = useCallback((url: string) => set({ bgImageUrl: url }), [set]);
  const handleImageRemove = useCallback(() => set({ bgImageUrl: "" }), [set]);

  // Logo upload (mirrors HeaderView pattern)
  const [showLogoModal, setShowLogoModal] = useState(false);
  const [isRemovingLogo, setIsRemovingLogo] = useState(false);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const { upload: uploadLogo, isUploading: isLogoUploading } = useUpload("hospitality/wallet-card");

  const currentLogo = logoPreviewUrl || logoUrl || "";

  const handleLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await uploadLogo(
      file,
      (localUrl) => setLogoPreviewUrl(localUrl),
      (result) => {
        setLogoPreviewUrl(null);
        set({ logoUrl: result.url });
      },
    );
  }, [set, uploadLogo]);

  const handleLogoRemove = useCallback(async () => {
    if (isRemovingLogo) return;
    setIsRemovingLogo(true);
    set({ logoUrl: "" });
    setIsRemovingLogo(false);
    setShowLogoModal(false);
  }, [isRemovingLogo, set]);

  const handleLogoEditClick = useCallback(() => {
    if (currentLogo) {
      setShowLogoModal(true);
    } else {
      logoFileRef.current?.click();
    }
  }, [currentLogo]);

  // Overlay slider
  const [localOverlay, setLocalOverlay] = useState(overlayOpacity);
  const prevOverlay = useRef(overlayOpacity);
  if (overlayOpacity !== prevOverlay.current) { prevOverlay.current = overlayOpacity; setLocalOverlay(overlayOpacity); }

  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleOverlayChange = useCallback((value: number) => {
    setLocalOverlay(value);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => set({ overlayOpacity: value }), 200);
  }, [set]);

  if (!loaded) return <><BackButton label="Check-in kort" onClick={onBack} /><div className="design-stagger-item" style={{ padding: "24px 0", color: "#999", fontSize: "0.9rem" }}>Laddar...</div></>;

  return (
    <>
      <BackButton label="Check-in kort" onClick={onBack} />

      {/* ── Background mode selector (identical to wallpaper) ── */}
      <div className="design-field-group design-stagger-item">
        <span className="design-field-label">Bakgrundstyp</span>
        <div className="design-toggle-row design-toggle-3col">
          {BG_MODES.map(({ key, label }) => {
            const previewStyle = wallpaperPreviewStyle(key, localBgColor, bg);
            return (
              <button key={key} type="button" className={"design-toggle-card " + (bgMode === key ? "design-toggle-active" : "")} onClick={() => set({ bgMode: key })}>
                <div className="design-toggle-icon design-toggle-icon--preview" style={previewStyle}>
                  {key === "image" && !bgImageUrl && (
                    <svg width="20" height="20" viewBox="0 0 256 256" fill="#bbb" style={{ opacity: 0.6 }}>
                      <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM176,88a16,16,0,1,1-16-16A16,16,0,0,1,176,88Z" />
                    </svg>
                  )}
                </div>
                <span className="design-toggle-label">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Color (shared by fill and gradient, identical to wallpaper) ── */}
      {(bgMode === "fill" || bgMode === "gradient") && (
        <ColorField label="Färg" value={localBgColor} onChange={handleColorChange} onPickerChange={handleColorPicker} />
      )}

      {/* ── Gradient direction (identical to wallpaper) ── */}
      {bgMode === "gradient" && (
        <div className="design-field-group">
          <span className="design-field-label">Riktning</span>
          <div className="design-toggle-row design-toggle-2col">
            {GRADIENT_DIRS.map(({ key, label }) => (
              <button key={key} type="button" className={"design-toggle-card " + (gradDirection === key ? "design-toggle-active" : "")} onClick={() => set({ gradDirection: key })}>
                <div className="design-toggle-icon">
                  <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    {key === "down" ? <path d="M12 5v14M19 12l-7 7-7-7" /> : <path d="M12 19V5M5 12l7-7 7 7" />}
                  </svg>
                </div>
                <span className="design-toggle-label">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Image upload (identical to wallpaper) ── */}
      {bgMode === "image" && (
        <>
          <div className="design-field-group">
            <span className="design-field-label">Bakgrundsbild</span>
            <ImageUpload
              value={bgImageUrl || undefined}
              onChange={handleImageChange}
              onRemove={handleImageRemove}
              folder="hospitality/wallet-card"
              placeholder="Välj bakgrundsbild..."
            />
          </div>

          <div className="design-field-group">
            <span className="design-field-label">Mörkläggning</span>
            <div className="design-slider-row">
              <DesignSlider min={0} max={80} step={1} value={Math.round(localOverlay * 100)} onChange={(e) => handleOverlayChange(Number(e.target.value) / 100)} />
              <div className="design-slider-input-wrap">
                <input type="number" min={0} max={80} value={Math.round(localOverlay * 100)} onChange={(e) => handleOverlayChange(Math.min(0.8, Math.max(0, Number(e.target.value) / 100)))} className="design-slider-input" />
                <span className="design-slider-unit">%</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Logo ── */}
      <div className="design-field-group design-stagger-item">
        <span className="design-field-label">Logotyp</span>
        <div className="design-logo-upload">
          <div className={"design-logo-avatar " + (isLogoUploading ? "design-logo-shimmer" : "")}>
            {currentLogo && !isLogoUploading ? (
              <img src={currentLogo} alt="Logotyp" className="design-logo-img" />
            ) : !isLogoUploading ? (
              <svg className="design-logo-placeholder" viewBox="0 0 145 144" fill="none" xmlns="http://www.w3.org/2000/svg"><g clipPath="url(#clip0_wlogo)"><rect width="145" height="146" fill="#A8AAA2" /><circle cx="72.396" cy="53.896" r="31.396" fill="#F6F7F5" /><ellipse cx="72.5" cy="150.5" rx="63.5" ry="59" fill="#F6F7F5" /></g><defs><clipPath id="clip0_wlogo"><rect width="145" height="146" fill="white" /></clipPath></defs></svg>
            ) : null}
          </div>
          <button type="button" className={"design-logo-btn " + (currentLogo ? "design-logo-btn-edit" : "")} onClick={handleLogoEditClick}>
            {currentLogo ? (
              <><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z" /></svg><span>Ändra</span></>
            ) : (
              <><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z" /></svg><span>Ladda upp</span></>
            )}
          </button>
          <input ref={logoFileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" onChange={handleLogoUpload} className="design-file-hidden" aria-hidden="true" />
        </div>
      </div>

      {/* ── Date text color ── */}
      <ColorField label="Datumfärg" value={dateColor.toUpperCase()} onChange={(v) => set({ dateColor: v })} onPickerChange={(v) => set({ dateColor: v })} className="design-stagger-item" />

      
      {showLogoModal && createPortal(
        <>
          <div className="design-modal-backdrop" onClick={() => setShowLogoModal(false)} />
          <div className="design-modal design-modal-sm">
            <button type="button" className="design-logo-modal-btn design-logo-modal-primary" onClick={() => { setShowLogoModal(false); logoFileRef.current?.click(); }}>Ändra logotyp</button>
            <button type="button" className="design-logo-modal-btn design-logo-modal-danger" onClick={handleLogoRemove} disabled={isRemovingLogo}>
              {isRemovingLogo && <SpinnerIcon />}
              <span>Ta bort logotyp</span>
            </button>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

/* ════════════════════════════════════════════
   Wallet Card Preview Panel — replaces phone preview
   ════════════════════════════════════════════ */

function WalletCardPreviewPanel() {
  const { state } = useContext(WalletCardCtx);

  const design = stateToDesignConfig(state);

  return (
    <div className="preview-widget preview-widget-sticky">
      <div className="preview-header">
        <div className="preview-header__unsaved">Check-in kort</div>
      </div>
      <div className="preview-widget-inner">
        <WalletCard design={design} dateLabel="Jun 22 - 25, 2026" className="wallet-card--panel" />
      </div>
    </div>
  );
}

/** Convert editor state to the canonical CardDesignConfig used by WalletCard. */
function stateToDesignConfig(state: WalletCardState): CardDesignConfig {
  let background: CardBackground;
  if (state.bgMode === "gradient") {
    background = { mode: "GRADIENT", from: state.bgColor, to: "transparent", angle: state.gradDirection === "up" ? 0 : 180 };
  } else if (state.bgMode === "image" && state.bgImageUrl) {
    background = { mode: "IMAGE", imageUrl: state.bgImageUrl, overlayOpacity: state.overlayOpacity };
  } else {
    background = { mode: "SOLID", color: state.bgColor };
  }
  return { background, logoUrl: state.logoUrl || null, dateTextColor: state.dateColor };
}

/* ════════════════════════════════════════════
   Placeholder View
   ════════════════════════════════════════════ */

function PlaceholderView({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <>
      <BackButton label={label.charAt(0).toUpperCase() + label.slice(1)} onClick={onBack} />
      <div className="design-stagger-item" style={{ padding: "24px 0", color: "#999", fontSize: "0.9rem" }}>Kommer snart...</div>
    </>
  );
}

/* ════════════════════════════════════════════
   Design Slider (filled track)
   ════════════════════════════════════════════ */

function DesignSlider({ min, max, step, value, onChange, className = "" }: {
  min: number; max: number; step: number; value: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; className?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
      className={"design-slider " + className}
      style={{ background: `linear-gradient(to right, #1a1a1a ${pct}%, #ECEBEA ${pct}%)` }}
    />
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
  return <svg className="design-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z" /></svg>;
}

function SpinnerIcon() {
  return (
    <svg className="design-spinner" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="32" strokeDashoffset="12" />
    </svg>
  );
}

function SavingSpinner() {
  return (
    <div className="design-saving">
      <svg className="publish-spinner" width="21" height="21" viewBox="0 0 21 21" fill="none">
        <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/* ════════════════════════════════════════════
   Icons (config-driven)
   ════════════════════════════════════════════ */

function ThemeIcon() {
  const { state } = useContext(WalletCardCtx);
  const design = stateToDesignConfig(state);

  return (
    <div className="design-icon-box--theme">
      <WalletCard design={design} dateLabel="Jun 22 - 25" className="wallet-card--theme-icon" />
    </div>
  );
}

function HeaderIcon({ logoUrl, bg, bgColor }: { logoUrl?: string; bg?: ThemeConfig["background"]; bgColor?: string }) {
  const mode = bg?.mode || "fill";
  const color = bgColor || "#ffffff";
  const style = wallpaperPreviewStyle(mode, color, bg || { mode: "fill" });
  return (
    <div className="design-icon-box design-icon-box--fill">
      <div style={{ ...style, position: "absolute", inset: 0, borderRadius: "inherit" }} />
      {logoUrl ? (
        <img src={logoUrl} alt="" style={{ position: "absolute", inset: 12, width: "calc(100% - 24px)", height: "calc(100% - 24px)", objectFit: "contain" }} />
      ) : (
        <svg style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", opacity: 0.4 }} width="20" height="20" viewBox="0 0 256 256" fill="#999">
          <path d="M224,48H32A8,8,0,0,0,24,56v56a8,8,0,0,0,8,8H224a8,8,0,0,0,8-8V56A8,8,0,0,0,224,48Zm-8,56H40V64H216Zm8,40H32a8,8,0,0,0-8,8v48a8,8,0,0,0,8,8H224a8,8,0,0,0,8-8V152A8,8,0,0,0,224,144Zm-8,48H40V160H216Z" />
        </svg>
      )}
    </div>
  );
}

function WallpaperIcon({ bg, bgColor }: { bg?: ThemeConfig["background"]; bgColor?: string }) {
  const mode = bg?.mode || "fill";
  const color = bgColor || "#ffffff";
  const style = wallpaperPreviewStyle(mode, color, bg || { mode: "fill" });
  return (
    <div className="design-icon-box design-icon-box--fill">
      <div style={{ ...style, position: "absolute", inset: 0, borderRadius: "inherit" }} />
    </div>
  );
}

function ButtonsIcon({ variant, color, radius }: { variant?: string; color?: string; radius?: string }) {
  const bg = color || "#8B3DFF";
  const isOutline = variant === "outline";
  const r = radius === "square" ? "0px" : radius === "rounded" ? "4px" : radius === "round" ? "6px" : radius === "full" ? "999px" : "8px";
  return (
    <div className="design-icon-box">
      <div style={{
        width: 32, height: 32, borderRadius: r,
        background: isOutline ? "transparent" : bg,
        border: isOutline ? `2px solid ${bg}` : "none",
      }} />
    </div>
  );
}

function TextIcon({ font }: { font?: string }) {
  const family = FONT_OPTIONS.find(f => f.key === font)?.family || "Inter, sans-serif";
  return (
    <div className="design-icon-box">
      <span style={{ fontSize: 23, fontWeight: 700, color: "#1a1a1a", fontFamily: family, lineHeight: 1 }}>Aa</span>
    </div>
  );
}

function ColorsIcon({ bg, accent }: { bg?: string; accent?: string }) {
  return (
    <div className="design-icon-box" style={{ display: "flex", gap: 2, padding: 8, alignItems: "stretch", width: 48, height: 48 }}>
      <div style={{
        flex: 1, borderRadius: "6px 0 0 6px",
        background: bg || "#fff",
        border: "1px solid rgba(0,0,0,0.08)",
      }} />
      <div style={{
        flex: 1, borderRadius: "0 6px 6px 0",
        background: accent || "#8B3DFF",
      }} />
    </div>
  );
}

function TilesIcon({ bg, radius }: { bg?: string; radius?: string }) {
  const r = radius === "square" ? "0px" : radius === "rounded" ? "4px" : radius === "round" ? "6px" : radius === "full" ? "999px" : "8px";
  const color = bg || "#F1F0EE";
  return (
    <div className="design-icon-box">
      <div style={{
        width: 32, height: 32, borderRadius: r,
        background: color,
      }} />
    </div>
  );
}
