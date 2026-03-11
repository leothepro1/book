"use client";
import React, { useCallback, useState, useTransition, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  DragOverEvent,
  pointerWithin,
  rectIntersection,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PreviewProvider, usePreview } from "../_components/GuestPreview";
import { GuestPreviewFrame } from "../_components/GuestPreview";
import "../_components/GuestPreview/preview.css";
import "../_components/admin-page.css";
import "./home.css";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import type { Card, ArchivedCard } from "@/app/(guest)/_lib/portal/homeLinks";
import { getCardTypeConfig, CARD_TYPE_LIST, isCategoryFriendly } from "@/app/_lib/cardTypes/registry";
import type { PanelKey as RegistryPanelKey } from "@/app/_lib/cardTypes/registry";
import { updateDraft } from "../_lib/tenant/updateDraft";
import { ImageUpload } from "../_components/ImageUpload";
import { useUpload } from "../_hooks/useUpload";
import { PublishBarProvider, PublishBar, usePublishBar } from "../_components/PublishBar";
import { ThemePickerContent } from "../themes/ThemePickerContent";

/**
 * Holds a local copy of the card for responsive inputs.
 * Updates local state immediately; debounces onUpdate to parent.
 */
function useBufferedCard(card: Card, onUpdate: (c: Card) => void, delay = 300) {
  const [local, setLocal] = useState(card);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const prevIdRef = useRef(card.id);

  // Sync from parent when card identity changes (different card selected)
  if (card.id !== prevIdRef.current) {
    prevIdRef.current = card.id;
    setLocal(card);
  }

  const bufferedUpdate = useCallback((updated: Card) => {
    setLocal(updated);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onUpdateRef.current(updated), delay);
  }, [delay]);

  // Flush on unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return [local, bufferedUpdate] as const;
}

// ── Drop zones ovanför/under kategori-kort ──────────────────────
function CategoryDropZone({ categoryId, position }: { categoryId: string; position: "above" | "below" }) {
  const id = position === "above" ? `cat_above_${categoryId}` : `cat_below_${categoryId}`;
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        height: 20,
        top: position === "above" ? -10 : undefined,
        bottom: position === "below" ? -10 : undefined,
        zIndex: 20,
        // debug: background: isOver ? "rgba(0,100,255,0.15)" : "transparent",
      }}
    />
  );
}
// ── State: vilken kategori är drop-zone-aktiv just nu (sätts av handleDragOver) ──
let _activeCategoryDropZone: string | null = null;

// ── Collision detection ──
// Princip: closestCenter för stabil sortering, men om drop-zone är aktiv
// på ett kategori-kort, returnera INTE det kortet (frys det).
function categoryAwareCollision(args: Parameters<typeof closestCenter>[0]) {
  const activeId = args.active.id as string;

  if (!_activeCategoryDropZone) {
    // Ingen drop-zone aktiv — standard closestCenter, alla kort likvärdiga
    return closestCenter(args);
  }

  // Drop-zone aktiv — filtrera bort det frysta kategori-kortet och sök bland resten
  const filtered = args.droppableContainers.filter(
    c => (c.id as string) !== _activeCategoryDropZone
  );
  const result = closestCenter({ ...args, droppableContainers: filtered });
  return result;
}


function ArchivePageInner() {
  const { config, updateConfig, notifyDraftSaved } = usePreview();
  const [isPending, startTransition] = useTransition();
  const cards: Card[] = (config?.home?.cards || []) as Card[];
  const archivedCards: ArchivedCard[] = (config?.home?.archivedCards || []) as ArchivedCard[];

  const handlePermanentDelete = useCallback((id: string) => {
    const updatedArchive = archivedCards.filter(c => c.id !== id);
    updateConfig({ home: { version: 1, links: config?.home?.links || [], cards, archivedCards: updatedArchive } } as any);
    startTransition(async () => { await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards, archivedCards: updatedArchive } } as any); notifyDraftSaved(); });
  }, [cards, archivedCards, config, updateConfig, notifyDraftSaved]);

  const handleRestore = useCallback((archived: ArchivedCard) => {
    const { archivedAt: _at, archivedBy: _by, archivedReason: _r, ...cardData } = archived as any;
    const restoredCard: Card = { ...cardData, isActive: false, sortOrder: cards.length };
    const updatedCards = [...cards, restoredCard];
    const updatedArchive = archivedCards.filter(c => c.id !== archived.id);
    updateConfig({ home: { version: 1, links: config?.home?.links || [], cards: updatedCards, archivedCards: updatedArchive } } as any);
    startTransition(async () => { await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: updatedCards, archivedCards: updatedArchive } } as any); notifyDraftSaved(); });
  }, [cards, archivedCards, config, updateConfig, notifyDraftSaved]);

  return (
    <div className="home-content">
      <div className="home-section-header">
        <div>
          <div className="home-section-title">Arkiverade kort</div>
          <div className="home-section-sub">{archivedCards.length} kort</div>
        </div>
      </div>
      <div className="home-card-list">
        {archivedCards.length === 0 ? (
          <div className="home-empty">Arkivet är tomt.</div>
        ) : (
          archivedCards.map(card => (
            <ArchivedCardItem
              key={card.id}
              card={card}
              onDelete={() => handlePermanentDelete(card.id)}
              onRestore={() => handleRestore(card)}
            />
          ))
        )}
      </div>
          </div>
  );
}

export default function HomeClient({ initialConfig }: { initialConfig: TenantConfig }) {
  return (
    <PreviewProvider initialConfig={initialConfig}>
      <HomeClientInner />
    </PreviewProvider>
  );
}

type HomeTab = "tema" | "lankar";

function HomeClientInner() {
  const [tab, setTab] = useState<HomeTab>("lankar");
  const [view, setView] = useState<"home" | "archive">("home");
  const { config } = usePreview();
  const getConfig = useCallback(() => config, [config]);

  // Theme view state — lifted here so header + preview can react
  type ThemeView = "grid" | "detail" | "configure";
  const configHasTheme = !!(config && config.themeId != null && config.themeId !== "");
  const [themeView, setThemeView] = useState<ThemeView>(() =>
    configHasTheme ? "configure" : "grid"
  );
  const [detailManifest, setDetailManifest] = useState<import("@/app/(guest)/_lib/themes/types").ThemeManifest | null>(null);

  // Sync: if theme gets removed (undo, external change) while on configure → grid
  useEffect(() => {
    if (themeView === "configure" && !configHasTheme) {
      setThemeView("grid");
    }
  }, [configHasTheme, themeView]);

  const handleThemeNavigate = useCallback((nextView: ThemeView, manifest?: import("@/app/(guest)/_lib/themes/types").ThemeManifest) => {
    setThemeView(nextView);
    setDetailManifest(manifest ?? null);
  }, []);

  const themeDetailOpen = tab === "tema" && themeView === "detail";
  const showThemeBack = tab === "tema" && themeView === "configure";

  const headerTitle = tab === "tema"
    ? "Home"
    : view === "archive"
      ? "Arkiv"
      : "Home";

  return (
    <PublishBarProvider getConfig={getConfig}>
      <div className={`admin-page${themeDetailOpen ? " admin-page--no-preview" : ""}`}>
        <div className="admin-editor">
          <div className="admin-header">
            {showThemeBack && <BackButton onClick={() => setThemeView("grid")} />}
            {tab === "lankar" && view === "archive" && <BackButton onClick={() => setView("home")} />}
            <h1 className="admin-title">{headerTitle}</h1>

            {/* Tab buttons */}
            <div className="home-tabs">
              <button
                type="button"
                className={`home-tab ${tab === "tema" ? "home-tab--active" : ""}`}
                onClick={() => { setTab("tema"); setView("home"); }}
              >
                Tema
              </button>
              <button
                type="button"
                className={`home-tab ${tab === "lankar" ? "home-tab--active" : ""}`}
                onClick={() => setTab("lankar")}
              >
                Länkar
              </button>
            </div>

            <PublishBar />
          </div>
          <div className="admin-content">
            {tab === "tema" ? (
              <ThemePickerContent
                view={themeView}
                detailManifest={detailManifest}
                onNavigate={handleThemeNavigate}
              />
            ) : (
              view === "home"
                ? <HomePageInner onNavigateToArchive={() => setView("archive")} />
                : <ArchivePageInner />
            )}
          </div>
        </div>
        {!themeDetailOpen && (
          <div className="admin-preview">
            <GuestPreviewFrame route="/p/[token]" className="preview-widget-sticky" />
          </div>
        )}
      </div>
    </PublishBarProvider>
  );
}

const ChevronIcon = ({ className }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={"sched-chevron" + (className ? " " + className : "")} aria-hidden="true"><path fill="currentColor" d="m1.7 4 .36.35L7.71 10l5.64-5.65.36-.35.7.7-.35.36-6 6h-.7l-6-6L1 4.71 1.7 4Z"/></svg>
);
const DragIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path fill="currentColor" d="M5 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm1 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm0 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm6-5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm1-11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>
);
const PenIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path fillRule="evenodd" d="M2 14v-2.3l7.5-7.5 2.3 2.3L4.3 14H2Zm10.5-8.2 1.3-1.3-2.3-2.3-1.3 1.3 2.3 2.3Zm-1.35-4.65-10 10-.15.35v3l.5.5h3l.35-.15 10-10v-.7l-3-3h-.7Z" fill="currentColor"/></svg>
);
const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path fillRule="evenodd" d="m6.83 0-.35.15-1.33 1.33-.15.35V3H0v1h2v11.5l.5.5h11l.5-.5V4h2V3h-5V1.83l-.15-.35L9.52.15 9.17 0H6.83ZM10 3v-.96L8.96 1H7.04L6 2.04V3h4ZM5 4H3v11h10V4H5Zm2 3v5H6V7h1Zm3 .5V7H9v5h1V7.5Z" fill="currentColor"/></svg>
);
const LayoutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16" width="16" height="16">
    <g clipPath="url(#c1)">
      <path d="M1.5 1.5H6.5V6.5H1.5z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="bevel" fill="transparent"/>
      <path d="M1.5 9.5H6.5V14.5H1.5z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="bevel" fill="transparent"/>
      <path d="M9.5 1.5H14.5V14.5H9.5z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="bevel" fill="transparent"/>
    </g>
    <defs><clipPath id="c1"><rect width="16" height="16" fill="white"/></clipPath></defs>
  </svg>
);
const ImageIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path fill="currentColor" d="M1.5 1v.5V1h13l.5.5V14.5l-.5.5H1.5l-.5-.5v-13l.5-.5Zm.5 9.72V14H13.75L6 7.17l-4 3.55ZM2 9.4l3.67-3.26h.66L14 12.88V2H2v7.39Zm9-3.4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/></svg>
);
const StarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8.005 12.937L3.37 15.5l.885-5.428L.5 6.228l5.182-.79L8 .5l2.318 4.938 5.182.79-3.755 3.844.885 5.428-4.625-2.563Z" stroke="currentColor" strokeWidth="1.077"/></svg>
);
const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16" width="16" height="16">
    <g>
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M3.5.5v2M10.5.5v2M11.5 9.5v2h2"/>
      <circle cx="11.5" cy="11.5" r="4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M13.5 5.85V2.5a1 1 0 00-1-1h-11a1 1 0 00-1 1v10a1 1 0 001 1h4.351"/>
    </g>
  </svg>
);
const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#2d2c2b" viewBox="0 0 256 256">
    <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/>
  </svg>
);
const UploadImageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256">
    <rect width="256" height="256" fill="none"/>
    <rect x="40" y="40" width="176" height="176" rx="8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16"/>
    <path d="M216,160l-42.3-42.3a8,8,0,0,0-11.4,0l-44.6,44.6a8,8,0,0,1-11.4,0L85.7,141.7a8,8,0,0,0-11.4,0L40,176" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16"/>
    <circle cx="100" cy="92" r="12"/>
  </svg>
);

// ── Panel Loading Context & Skeleton ─────────────────────────────
const PanelLoadingContext = React.createContext<{
  setLoading: (loading: boolean) => void;
}>({ setLoading: () => {} });

/** Call from any panel body to explicitly control skeleton visibility (e.g. during network requests). */
const usePanelLoading = () => React.useContext(PanelLoadingContext);

function PanelSkeleton() {
  return (
    <div className="panel-skeleton">
      <div className="panel-skeleton-bar" />
      <div className="panel-skeleton-bar" />
      <div className="panel-skeleton-bar" />
    </div>
  );
}

/**
 * Wraps any panel content with automatic skeleton shimmer.
 * Skeleton shows on mount until first paint, and panels can
 * extend loading via usePanelLoading().setLoading(true).
 */
function PanelContentWrapper({ children, panelKey }: { children: React.ReactNode; panelKey: string | null }) {
  const [externalLoading, setExternalLoading] = useState(false);

  return (
    <PanelLoadingContext.Provider value={{ setLoading: setExternalLoading }}>
      <div className="panel-content-wrap">
        <div className={"panel-skeleton" + (!externalLoading ? " panel-skeleton--hidden" : "")}>
          <div className="panel-skeleton-bar" />
          <div className="panel-skeleton-bar" />
          <div className="panel-skeleton-bar" />
        </div>
        <div className={"panel-content" + (externalLoading ? " panel-content--hidden" : "")}>
          {children}
        </div>
      </div>
    </PanelLoadingContext.Provider>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={onChange}
      className={"admin-toggle" + (checked ? " admin-toggle-on" : "")}>
      <span className="admin-toggle-icon admin-toggle-icon--check material-symbols-outlined">check</span>
      <span className="admin-toggle-icon admin-toggle-icon--remove material-symbols-outlined">remove</span>
      <span className="admin-toggle-thumb" />
    </button>
  );
}

type PanelKey = "layout" | "image" | "badge" | "schedule" | "delete" | null;
const PANEL_LABELS: Record<Exclude<PanelKey, null>, string> = {
  layout: "Layout", image: "Bild", badge: "Badge", schedule: "Schemalägg", delete: "Ta bort",
};


const CATEGORY_LAYOUTS: {
  key: import("@/app/(guest)/_lib/portal/homeLinks").CategoryLayout;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "stack",
    label: "Stapel",
    description: "Korten visas i en vertikal lista, en i taget. Perfekt för tydlig navigering.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 256 256">
        <path d="M208,136H48a16,16,0,0,0-16,16v40a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V152A16,16,0,0,0,208,136Zm0,56H48V152H208v40Zm0-144H48A16,16,0,0,0,32,64v40a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V64A16,16,0,0,0,208,48Zm0,56H48V64H208v40Z"/>
      </svg>
    ),
  },
  {
    key: "grid",
    label: "Grid",
    description: "Korten visas i ett rutnät med två kolumner. Passar bra för kategorier med många kort.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 256 256">
        <path d="M104,40H56A16,16,0,0,0,40,56v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,104,40Zm0,64H56V56h48v48Zm96-64H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm0,64H152V56h48v48Zm-96,32H56a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,104,136Zm0,64H56V152h48v48Zm96-64H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,200,136Zm0,64H152V152h48v48Z"/>
      </svg>
    ),
  },
  {
    key: "slider",
    label: "Slider",
    description: "Korten visas i en horisontell karusell som gästerna kan svepa igenom.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 256 256">
        <path d="M192,48H64A16,16,0,0,0,48,64V192a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64A16,16,0,0,0,192,48Zm0,144H64V64H192V192ZM240,56V200a8,8,0,0,1-16,0V56a8,8,0,0,1,16,0ZM32,56V200a8,8,0,0,1-16,0V56a8,8,0,0,1,16,0Z"/>
      </svg>
    ),
  },
  {
    key: "showcase",
    label: "Showcase",
    description: "Korten visas stort och framträdande. Idealiskt för att lyfta fram utvalda upplevelser.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="currentColor" viewBox="0 0 256 256">
        <path d="M200,80v32a8,8,0,0,1-16,0V88H160a8,8,0,0,1,0-16h32A8,8,0,0,1,200,80ZM96,168H72V144a8,8,0,0,0-16,0v32a8,8,0,0,0,8,8H96a8,8,0,0,0,0-16ZM232,56V200a16,16,0,0,1-16,16H40a16,16,0,0,1-16-16V56A16,16,0,0,1,40,40H216A16,16,0,0,1,232,56ZM216,200V56H40V200H216Z"/>
      </svg>
    ),
  },
];

const RestoreIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 16" width="16px" height="16px">
    <path stroke="currentColor" d="M1.65 4.25v10.67h12.7c-.02-3.55 0-7.11 0-10.67M15.5 1.08H.5v2.88h15V1.08Z"/>
    <path stroke="currentColor" d="M5.7 9.15 8 6.85l2.3 2.3M8 7.4v4.65"/>
  </svg>
);

function DeletePanelContent({ onDelete, onArchive }: { onDelete: () => void; onArchive: () => void }) {
  return (
    <div className="card-panel-body card-panel-body--delete">
      <div className="delete-panel-options">
        <div className="delete-panel-option">
          <button type="button" className="delete-panel-btn delete-panel-btn--danger" onClick={onDelete}>Ta bort</button>
          <span className="delete-panel-sub">Delete forever.</span>
        </div>
        <div className="delete-panel-option">
          <button type="button" className="delete-panel-btn delete-panel-btn--archive" onClick={onArchive}>Arkivera</button>
          <span className="delete-panel-sub">Reduce clutter and restore anytime.</span>
        </div>
      </div>
    </div>
  );
}

function RestorePanelContent({ onRestore, onCancel }: { onRestore: () => void; onCancel: () => void }) {
  return (
    <div className="card-panel-body card-panel-body--delete">
      <p className="card-panel-desc">Kortet flyttas tillbaka till aktiva listan.</p>
      <div className="delete-panel-options">
        <div className="delete-panel-option">
          <button type="button" className="delete-panel-btn delete-panel-btn--cancel" onClick={onCancel}>Avbryt</button>
        </div>
        <div className="delete-panel-option">
          <button type="button" className="delete-panel-btn delete-panel-btn--archive" onClick={onRestore}>Avarkivera</button>
        </div>
      </div>
    </div>
  );
}

// ── FeaturedUploadButton ─────────────────────────────────────────
function FeaturedUploadButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading } = useUpload("cards");

  const handleFile = async (file: File) => {
    await upload(
      file,
      () => {},
      () => {},
    );
  };

  return (
    <div onClick={e => e.stopPropagation()}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        style={{ display: "none" }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (!file) return;
          e.target.value = "";
          handleFile(file);
        }}
      />
      <button
        type="button"
        className="featured-upload-btn"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
      >
        {isUploading ? (
          <span className="img-upload-spinner" />
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
          </svg>
        )}
        <span>{isUploading ? "Laddar upp..." : "Ladda upp bild"}</span>
      </button>
    </div>
  );
}

function LayoutPanelContent({ card, onChange }: { card: Card; onChange: (layout: string) => void }) {
  const ctConfig = getCardTypeConfig((card as any).cardType);
  const current: string = (card as any).layoutStyle ?? ctConfig.layouts[0].key;
  const hasImage = !!(card as any).image;
  return (
    <div className="card-panel-body">
      <p className="card-panel-desc">Choose a layout for your link</p>
      <div className="card-panel-options">
        {ctConfig.layouts.map((layout) => (
          <button key={layout.key} type="button"
            className={"card-layout-option" + (current === layout.key ? " card-layout-option--active" : "")}
            onClick={() => onChange(layout.key)}>
            <div className="card-layout-option-left">
              <div className={"card-layout-radio" + (current === layout.key ? " card-layout-radio--checked" : "")}>
                {current === layout.key && <div className="card-layout-radio-dot" />}
              </div>
              <div>
                <div className="card-layout-option-title">{layout.label}</div>
                <div className="card-layout-option-sub">{layout.description}</div>
                {layout.needsImage && !hasImage && <FeaturedUploadButton />}
              </div>
            </div>
            <img src={layout.previewImage} alt={layout.label} className="card-layout-preview" />
          </button>
        ))}
      </div>
    </div>
  );
}

function TextLayoutPanel({ card: cardProp, onUpdate: onUpdateProp }: { card: Card; onUpdate: (updated: Card) => void }) {
  const [card, onUpdate] = useBufferedCard(cardProp, onUpdateProp);
  const [tab, setTab] = useState<"settings" | "layout">("settings");
  const ctConfig = getCardTypeConfig((card as any).cardType);
  const current: string = (card as any).layoutStyle ?? ctConfig.layouts[0].key;
  const hasImage = !!(card as any).image;

  const content: string = (card as any).content ?? "";
  const ctaLabel: string = card.ctaLabel ?? "";
  const ctaUrl: string = (card as any).ctaUrl ?? "";
  const MAX_CHARS = 1000;

  return (
    <div className="card-panel-body">
      <div className="card-panel-tabs">
        <button type="button"
          className={"card-panel-tab" + (tab === "settings" ? " card-panel-tab--active" : "")}
          onClick={() => setTab("settings")}>
          Inställningar
        </button>
        <button type="button"
          className={"card-panel-tab" + (tab === "layout" ? " card-panel-tab--active" : "")}
          onClick={() => setTab("layout")}>
          Layout
        </button>
        <div className={"card-panel-tab-indicator" + (tab === "layout" ? " card-panel-tab-indicator--right" : "")} />
      </div>

      {tab === "settings" && (
        <div className="card-panel-tab-content">
          <h3 className="card-panel-title">Text</h3>
          <p className="card-panel-desc">Skriv texten du vill visa</p>
          <div className="tp-textarea-wrap">
            <textarea
              className="tp-textarea"
              value={content}
              maxLength={MAX_CHARS}
              onChange={e => onUpdate({ ...card, content: e.target.value } as any)}
              rows={4}
            />
            <span className="tp-textarea-count">{content.length}/{MAX_CHARS}</span>
          </div>

          <h3 className="card-panel-title" style={{ marginTop: 24 }}>Knapp (valfritt)</h3>
          <p className="card-panel-desc">Lägg till en knapp som länkar till en URL</p>
          <div className="tp-fields">
            <div className="tp-float-field">
              <input
                className="tp-float-input"
                value={ctaLabel}
                placeholder=" "
                onChange={e => onUpdate({ ...card, ctaLabel: e.target.value || undefined } as any)}
              />
              <label className="tp-float-label">Button title</label>
            </div>
            <div className="tp-float-field">
              <input
                className="tp-float-input"
                value={ctaUrl}
                placeholder=" "
                onChange={e => onUpdate({ ...card, ctaUrl: e.target.value || undefined } as any)}
              />
              <label className="tp-float-label">Button URL</label>
            </div>
          </div>
        </div>
      )}

      {tab === "layout" && (
        <div className="card-panel-tab-content">
          <div className="card-panel-options">
            {ctConfig.layouts.map((layout) => (
              <button key={layout.key} type="button"
                className={"card-layout-option" + (current === layout.key ? " card-layout-option--active" : "")}
                onClick={() => onUpdate({ ...card, layoutStyle: layout.key } as any)}>
                <div className="card-layout-option-left">
                  <div className={"card-layout-radio" + (current === layout.key ? " card-layout-radio--checked" : "")}>
                    {current === layout.key && <div className="card-layout-radio-dot" />}
                  </div>
                  <div>
                    <div className="card-layout-option-title">{layout.label}</div>
                    <div className="card-layout-option-sub">{layout.description}</div>
                    {layout.needsImage && !hasImage && <FeaturedUploadButton />}
                  </div>
                </div>
                <img src={layout.previewImage} alt={layout.label} className="card-layout-preview" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentLayoutPanel({ card: cardProp, onUpdate: onUpdateProp }: { card: Card; onUpdate: (updated: Card) => void }) {
  const [card, onUpdate] = useBufferedCard(cardProp, onUpdateProp);
  const [tab, setTab] = useState<"settings" | "layout">("settings");
  const ctConfig = getCardTypeConfig((card as any).cardType);
  const current: string = (card as any).layoutStyle ?? ctConfig.layouts[0].key;
  const hasImage = !!(card as any).image;

  const fileUrl: string = (card as any).fileUrl ?? "";
  const fileName: string = (card as any).fileName ?? "";
  const fileDescription: string = (card as any).fileDescription ?? "";
  const DESC_MAX = 240;

  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="card-panel-body">
      <div className="card-panel-tabs">
        <button type="button"
          className={"card-panel-tab" + (tab === "settings" ? " card-panel-tab--active" : "")}
          onClick={() => setTab("settings")}>
          Inställningar
        </button>
        <button type="button"
          className={"card-panel-tab" + (tab === "layout" ? " card-panel-tab--active" : "")}
          onClick={() => setTab("layout")}>
          Layout
        </button>
        <div className={"card-panel-tab-indicator" + (tab === "layout" ? " card-panel-tab-indicator--right" : "")} />
      </div>

      {tab === "settings" && (
        <div className="card-panel-tab-content">
          <h3 className="card-panel-title">Dokument</h3>
          <p className="card-panel-desc">Visa en nedladdningsbar PDF-fil med en beskrivning.</p>

          <h3 className="card-panel-title" style={{ marginTop: 24 }}>Ladda upp fil</h3>
          <button
            type="button"
            className="doc-file-btn"
            onClick={() => setModalOpen(true)}
          >
            {fileUrl ? (
              <>
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" clipRule="evenodd" d="M8.33365 0.5C8.5821 0.5 8.7835 0.701408 8.7835 0.949858V4.13881C8.7835 4.23094 8.8201 4.3193 8.88525 4.38445C8.9504 4.44959 9.03875 4.48619 9.13089 4.48619H12.3198C12.5683 4.48619 12.7697 4.6876 12.7697 4.93605C12.7697 5.1845 12.5683 5.38591 12.3198 5.38591H9.13089C8.80013 5.38591 8.48293 5.25452 8.24906 5.02064C8.01518 4.78676 7.88379 4.46956 7.88379 4.13881V0.949858C7.88379 0.701408 8.0852 0.5 8.33365 0.5Z" fill="currentColor" />
                  <path fillRule="evenodd" clipRule="evenodd" d="M2.75283 1.39972C2.44926 1.39972 2.15812 1.52031 1.94346 1.73497C1.72881 1.94962 1.60821 2.24076 1.60821 2.54433V8.125C1.60821 8.37345 1.4068 8.57486 1.15835 8.57486C0.909904 8.57486 0.708496 8.37345 0.708496 8.125V2.54433C0.708496 2.00214 0.923881 1.48216 1.30727 1.09877C1.69065 0.715384 2.21064 0.5 2.75283 0.5H8.3335C8.45281 0.5 8.56723 0.547396 8.6516 0.63176L12.6378 4.61795C12.7222 4.70232 12.7695 4.81674 12.7695 4.93605V8.125C12.7695 8.37345 12.5681 8.57486 12.3197 8.57486C12.0712 8.57486 11.8698 8.37345 11.8698 8.125V5.12239L8.14716 1.39972H2.75283Z" fill="currentColor" />
                  <path fillRule="evenodd" clipRule="evenodd" d="M0.708496 10.5167C0.708496 10.2683 0.909904 10.0669 1.15835 10.0669H2.35421C2.79068 10.0669 3.20928 10.2402 3.51791 10.5489C3.82654 10.8575 3.99993 11.2761 3.99993 11.7126C3.99993 12.149 3.82654 12.5676 3.51791 12.8763C3.20928 13.1849 2.79068 13.3583 2.35421 13.3583H1.60821V15.3001C1.60821 15.5486 1.4068 15.75 1.15835 15.75C0.909904 15.75 0.708496 15.5486 0.708496 15.3001V10.5167Z" fill="currentColor" />
                  <path fillRule="evenodd" clipRule="evenodd" d="M5.49194 10.5167C5.49194 10.2683 5.69335 10.0669 5.9418 10.0669H6.73904C7.28123 10.0669 7.80121 10.2822 8.1846 10.6656C8.56799 11.049 8.78337 11.569 8.78337 12.1112V13.7057C8.78337 14.2479 8.56799 14.7678 8.1846 15.1512C7.80121 15.5346 7.28123 15.75 6.73904 15.75H5.9418C5.69335 15.75 5.49194 15.5486 5.49194 15.3001V10.5167Z" fill="currentColor" />
                  <path fillRule="evenodd" clipRule="evenodd" d="M10.2754 10.5167C10.2754 10.2683 10.4768 10.0669 10.7252 10.0669H13.117C13.3654 10.0669 13.5668 10.2683 13.5668 10.5167C13.5668 10.7652 13.3654 10.9666 13.117 10.9666H11.1751V15.3001C11.1751 15.5486 10.9737 15.75 10.7252 15.75C10.4768 15.75 10.2754 15.5486 10.2754 15.3001V10.5167Z" fill="currentColor" />
                </svg>
                <span className="doc-file-btn__name">{fileName}</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#687584" strokeLinecap="round">
                  <line x1="0.5" y1="11.5" x2="23.5" y2="11.5" />
                  <line x1="12.5" y1="0.5" x2="12.5" y2="23.5" />
                </svg>
                <span>Välj fil...</span>
              </>
            )}
          </button>

          <h3 className="card-panel-title" style={{ marginTop: 24 }}>Beskrivning</h3>
          <p className="card-panel-desc">Lägg till en beskrivning som visas under din PDF förhandsvisning</p>
          <div className="tp-textarea-wrap" style={{ marginTop: 12 }}>
            <input
              className="tp-float-input"
              style={{ padding: "12px" }}
              value={fileDescription}
              maxLength={DESC_MAX}
              onChange={e => onUpdate({ ...card, fileDescription: e.target.value || undefined } as any)}
            />
            <span className="tp-textarea-count">{fileDescription.length}/{DESC_MAX}</span>
          </div>

          {modalOpen && typeof window !== "undefined" && createPortal(
            <DocUploadModal
              fileUrl={fileUrl}
              fileName={fileName}
              onUpload={(url, name, publicId) => {
                onUpdate({ ...card, fileUrl: url, fileName: name, filePublicId: publicId } as any);
              }}
              onClear={() => {
                onUpdate({ ...card, fileUrl: undefined, fileName: undefined, filePublicId: undefined } as any);
              }}
              onClose={() => setModalOpen(false)}
            />,
            document.body
          )}
        </div>
      )}

      {tab === "layout" && (
        <div className="card-panel-tab-content">
          <div className="card-panel-options">
            {ctConfig.layouts.map((layout) => (
              <button key={layout.key} type="button"
                className={"card-layout-option" + (current === layout.key ? " card-layout-option--active" : "")}
                onClick={() => onUpdate({ ...card, layoutStyle: layout.key } as any)}>
                <div className="card-layout-option-left">
                  <div className={"card-layout-radio" + (current === layout.key ? " card-layout-radio--checked" : "")}>
                    {current === layout.key && <div className="card-layout-radio-dot" />}
                  </div>
                  <div>
                    <div className="card-layout-option-title">{layout.label}</div>
                    <div className="card-layout-option-sub">{layout.description}</div>
                    {layout.needsImage && !hasImage && <FeaturedUploadButton />}
                  </div>
                </div>
                <img src={layout.previewImage} alt={layout.label} className="card-layout-preview" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DocUploadModal({ fileUrl, fileName, onUpload, onClear, onClose }: {
  fileUrl: string;
  fileName: string;
  onUpload: (url: string, name: string, publicId: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading, error } = useUpload("hospitality/documents");
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    fileUrl ? fileUrl.replace("/upload/", "/upload/pg_1,w_600,f_jpg/") : null
  );
  const [currentName, setCurrentName] = useState(fileName);
  const [isDragging, setIsDragging] = useState(false);
  // Pending upload — not yet confirmed via "Välj fil"
  const [pending, setPending] = useState<{ url: string; name: string; publicId: string } | null>(null);

  const alreadySaved = !!fileUrl;
  const hasPreview = !!previewUrl;
  const hasPending = !!pending;

  const handleFile = useCallback(async (file: File) => {
    setCurrentName(file.name);
    await upload(
      file,
      (preview) => setPreviewUrl(preview),
      (result) => {
        const preview = result.url.replace("/upload/", "/upload/pg_1,w_600,f_jpg/");
        setPreviewUrl(preview);
        setPending({ url: result.url, name: file.name, publicId: result.publicId });
      },
    );
  }, [upload]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    handleFile(file);
  }, [handleFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === "application/pdf") handleFile(file);
  }, [handleFile]);

  const handleConfirm = useCallback(() => {
    if (alreadySaved) {
      // "Byt fil" — open file picker
      inputRef.current?.click();
    } else if (pending) {
      // "Välj fil" — confirm pending upload
      onUpload(pending.url, pending.name, pending.publicId);
      onClose();
    }
  }, [alreadySaved, pending, onUpload, onClose]);

  return (
    <div className="doc-modal-backdrop" onClick={onClose}>
      <div className="doc-modal" onClick={e => e.stopPropagation()}>
        <div className="doc-modal__header">
          <h3 className="doc-modal__title">Ladda upp PDF</h3>
          <button type="button" className="doc-modal__close" onClick={onClose} aria-label="Stäng">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill="currentColor" d="m13.63 3.12.37-.38-.74-.74-.38.37.75.75ZM2.37 12.89l-.37.37.74.74.38-.37-.75-.75Zm.75-10.52L2.74 2 2 2.74l.37.38.75-.75Zm9.76 11.26.38.37.74-.74-.37-.38-.75.75Zm0-11.26L2.38 12.9l.74.74 10.5-10.51-.74-.75Zm-10.5.75 10.5 10.5.75-.73L3.12 2.37l-.75.75Z" />
            </svg>
          </button>
        </div>

        <div className="doc-modal__body">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            onChange={handleChange}
            style={{ display: "none" }}
          />

          {hasPreview ? (
            <div className="doc-modal__preview">
              <img
                src={previewUrl ?? ""}
                alt="PDF preview"
                className="doc-modal__preview-img"
              />
              <span className="doc-modal__preview-name">{currentName}</span>
            </div>
          ) : (
            <div
              className={"doc-modal__dropzone" + (isDragging ? " doc-modal__dropzone--drag" : "")}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => !isUploading && inputRef.current?.click()}
            >
              {isUploading ? (
                <>
                  <span className="doc-modal__spinner" />
                  <span className="doc-modal__dropzone-text">Laddar upp...</span>
                </>
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path fillRule="evenodd" d="M3.5 0 3 .5v23l.5.5h17l.5-.5v-16l-.15-.35-7-7L13.5 0h-10ZM4 23V1h9v6.5l.5.5H20v15H4ZM19.3 7 14 1.7V7h5.3Z" fill="currentColor" />
                  </svg>
                  <span className="doc-modal__dropzone-text">
                    Välj fil att ladda upp<br />eller dra och släpp.
                  </span>
                </>
              )}
            </div>
          )}

          {error && <p className="img-upload-error" style={{ marginTop: 8 }}>{error}</p>}
        </div>

        <div className="doc-modal__actions">
          <button
            type="button"
            className="doc-modal__btn doc-modal__btn--clear"
            disabled={!hasPreview}
            onClick={() => { onClear(); setPreviewUrl(null); setCurrentName(""); setPending(null); }}
          >
            Ta bort
          </button>
          <button
            type="button"
            className={"doc-modal__btn doc-modal__btn--upload" + (alreadySaved || hasPending ? " doc-modal__btn--upload-active" : "")}
            disabled={!alreadySaved && !hasPending}
            onClick={handleConfirm}
          >
            {alreadySaved ? "Byt fil" : "Välj fil"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FaqEditModal({ initial, onSave, onClose }: {
  initial?: { question: string; answer: string };
  onSave: (question: string, answer: string) => void;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const Q_MAX = 200;
  const A_MAX = 800;
  const canSave = question.trim().length > 0 && answer.trim().length > 0;
  const isEdit = !!initial;

  return (
    <div className="doc-modal-backdrop" onClick={onClose}>
      <div className="doc-modal" onClick={e => e.stopPropagation()}>
        <div className="doc-modal__header">
          <h3 className="doc-modal__title">{isEdit ? "Redigera fråga" : "Lägg till fråga"}</h3>
          <button type="button" className="doc-modal__close" onClick={onClose} aria-label="Stäng">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill="currentColor" d="m13.63 3.12.37-.38-.74-.74-.38.37.75.75ZM2.37 12.89l-.37.37.74.74.38-.37-.75-.75Zm.75-10.52L2.74 2 2 2.74l.37.38.75-.75Zm9.76 11.26.38.37.74-.74-.37-.38-.75.75Zm0-11.26L2.38 12.9l.74.74 10.5-10.51-.74-.75Zm-10.5.75 10.5 10.5.75-.73L3.12 2.37l-.75.75Z" />
            </svg>
          </button>
        </div>

        <div className="doc-modal__body">
          <div className="tp-textarea-wrap">
            <label className="tp-field-label" htmlFor="faq-question">Fråga</label>
            <input
              id="faq-question"
              className="tp-float-input"
              style={{ padding: "12px" }}
              value={question}
              maxLength={Q_MAX}
              placeholder=" "
              onChange={e => setQuestion(e.target.value)}
            />
            <span className="tp-textarea-count">{question.length}/{Q_MAX}</span>
          </div>

          <div className="tp-textarea-wrap" style={{ marginTop: 16 }}>
            <label className="tp-field-label" htmlFor="faq-answer">Svar</label>
            <textarea
              id="faq-answer"
              className="tp-textarea"
              value={answer}
              maxLength={A_MAX}
              rows={4}
              onChange={e => setAnswer(e.target.value)}
            />
            <span className="tp-textarea-count">{answer.length}/{A_MAX}</span>
          </div>
        </div>

        <div className="doc-modal__actions">
          <button
            type="button"
            className={"doc-modal__btn doc-modal__btn--upload" + (canSave ? " doc-modal__btn--upload-active" : "")}
            disabled={!canSave}
            style={{ flex: "none", width: "100%" }}
            onClick={() => { onSave(question.trim(), answer.trim()); onClose(); }}
          >
            Spara
          </button>
        </div>
      </div>
    </div>
  );
}

type FaqItemData = { id: string; question: string; answer: string; isActive: boolean };

function SortableFaqItem({ faq, onEdit, onToggle, dragHandleProps }: {
  faq: FaqItemData;
  onEdit: () => void;
  onToggle: () => void;
  dragHandleProps: Record<string, any>;
}) {
  return (
    <div className={"faq-list-item" + (!faq.isActive ? " faq-list-item--inactive" : "")}>
      <div className="faq-list-item__drag" {...dragHandleProps} title="Dra för att sortera">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path fill="currentColor" d="M5 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm1 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm0 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm6-5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm1-11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>
      </div>
      <div className="faq-list-item__text">
        <span className="faq-list-item__q">{faq.question}</span>
      </div>
      <button type="button" className="faq-list-item__edit" onClick={onEdit} aria-label="Redigera">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path fillRule="evenodd" d="M2 14v-2.3l7.5-7.5 2.3 2.3L4.3 14H2Zm10.5-8.2 1.3-1.3-2.3-2.3-1.3 1.3 2.3 2.3Zm-1.35-4.65-10 10-.15.35v3l.5.5h3l.35-.15 10-10v-.7l-3-3h-.7Z" fill="currentColor"/></svg>
      </button>
      <button type="button" role="switch" aria-checked={faq.isActive} onClick={onToggle}
        className={"admin-toggle" + (faq.isActive ? " admin-toggle-on" : "")}>
        <span className="admin-toggle-icon admin-toggle-icon--check material-symbols-outlined">check</span>
        <span className="admin-toggle-icon admin-toggle-icon--remove material-symbols-outlined">remove</span>
        <span className="admin-toggle-thumb" />
      </button>
    </div>
  );
}

function SortableFaqItemWrapper({ faq, onEdit, onToggle }: {
  faq: FaqItemData;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: faq.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <SortableFaqItem faq={faq} onEdit={onEdit} onToggle={onToggle} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function FaqLayoutPanel({ card: cardProp, onUpdate: onUpdateProp }: { card: Card; onUpdate: (updated: Card) => void }) {
  const [card, onUpdate] = useBufferedCard(cardProp, onUpdateProp);
  const [tab, setTab] = useState<"questions" | "layout">("questions");
  const ctConfig = getCardTypeConfig((card as any).cardType);
  const current: string = (card as any).layoutStyle ?? ctConfig.layouts[0].key;
  const hasImage = !!(card as any).image;

  const faqs: FaqItemData[] = ((card as any).faqs ?? []).map((f: any) => ({
    id: f.id ?? `faq_${Math.random().toString(36).slice(2, 9)}`,
    question: f.question,
    answer: f.answer,
    isActive: f.isActive !== false,
  }));
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const faqSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleFaqDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = faqs.findIndex(f => f.id === active.id);
    const newIdx = faqs.findIndex(f => f.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(faqs, oldIdx, newIdx);
    onUpdate({ ...card, faqs: reordered } as any);
  }, [faqs, card, onUpdate]);

  const handleToggleFaq = useCallback((id: string) => {
    const updated = faqs.map(f => f.id === id ? { ...f, isActive: !f.isActive } : f);
    onUpdate({ ...card, faqs: updated } as any);
  }, [faqs, card, onUpdate]);

  const handleSaveFaq = useCallback((index: number | null, question: string, answer: string) => {
    if (index !== null) {
      const updated = faqs.map((f, i) => i === index ? { ...f, question, answer } : f);
      onUpdate({ ...card, faqs: updated } as any);
    } else {
      const newFaq: FaqItemData = { id: `faq_${Date.now()}`, question, answer, isActive: true };
      onUpdate({ ...card, faqs: [...faqs, newFaq] } as any);
    }
  }, [faqs, card, onUpdate]);

  return (
    <div className="card-panel-body">
      <div className="card-panel-tabs">
        <button type="button"
          className={"card-panel-tab" + (tab === "questions" ? " card-panel-tab--active" : "")}
          onClick={() => setTab("questions")}>
          Frågor
        </button>
        <button type="button"
          className={"card-panel-tab" + (tab === "layout" ? " card-panel-tab--active" : "")}
          onClick={() => setTab("layout")}>
          Layout
        </button>
        <div className={"card-panel-tab-indicator" + (tab === "layout" ? " card-panel-tab-indicator--right" : "")} />
      </div>

      {tab === "questions" && (
        <div className="card-panel-tab-content">
          <h3 className="card-panel-title">Vanliga frågor</h3>
          <p className="card-panel-desc">Hjälp era gäster med ge svar på deras vanliga frågor</p>

          {faqs.length > 0 && (
            <DndContext
              id={`faq-dnd-${card.id}`}
              sensors={faqSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleFaqDragEnd}
            >
              <SortableContext items={faqs.map(f => f.id)} strategy={verticalListSortingStrategy}>
                <div className="faq-list">
                  {faqs.map((faq, i) => (
                    <SortableFaqItemWrapper
                      key={faq.id}
                      faq={faq}
                      onEdit={() => { setEditingIndex(i); setModalOpen(true); }}
                      onToggle={() => handleToggleFaq(faq.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <button
            type="button"
            className="home-add-btn-full"
            style={{ marginTop: 16 }}
            onClick={() => { setEditingIndex(null); setModalOpen(true); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
              <rect width="256" height="256" fill="none"/>
              <line x1="40" y1="128" x2="216" y2="128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16"/>
              <line x1="128" y1="40" x2="128" y2="216" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16"/>
            </svg>
            Lägg till en fråga
          </button>

          {modalOpen && typeof window !== "undefined" && createPortal(
            <FaqEditModal
              initial={editingIndex !== null ? faqs[editingIndex] : undefined}
              onSave={(q, a) => handleSaveFaq(editingIndex, q, a)}
              onClose={() => { setModalOpen(false); setEditingIndex(null); }}
            />,
            document.body
          )}
        </div>
      )}

      {tab === "layout" && (
        <div className="card-panel-tab-content">
          <div className="card-panel-options">
            {ctConfig.layouts.map((layout) => (
              <button key={layout.key} type="button"
                className={"card-layout-option" + (current === layout.key ? " card-layout-option--active" : "")}
                onClick={() => onUpdate({ ...card, layoutStyle: layout.key } as any)}>
                <div className="card-layout-option-left">
                  <div className={"card-layout-radio" + (current === layout.key ? " card-layout-radio--checked" : "")}>
                    {current === layout.key && <div className="card-layout-radio-dot" />}
                  </div>
                  <div>
                    <div className="card-layout-option-title">{layout.label}</div>
                    <div className="card-layout-option-sub">{layout.description}</div>
                    {layout.needsImage && !hasImage && <FeaturedUploadButton />}
                  </div>
                </div>
                <img src={layout.previewImage} alt={layout.label} className="card-layout-preview" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const COUNTRIES = [
  "Afghanistan","Albanien","Algeriet","Andorra","Angola","Argentina","Armenien","Australien","Azerbajdzjan",
  "Bahamas","Bahrain","Bangladesh","Barbados","Belgien","Belize","Benin","Bhutan","Bolivia","Bosnien och Hercegovina",
  "Botswana","Brasilien","Brunei","Bulgarien","Burkina Faso","Burundi","Chile","Colombia","Costa Rica","Cypern",
  "Danmark","Dominikanska republiken","Ecuador","Egypten","El Salvador","Elfenbenskusten","Eritrea","Estland","Etiopien",
  "Fiji","Filippinerna","Finland","Frankrike","Förenade Arabemiraten","Gabon","Georgien","Ghana","Grekland","Guatemala",
  "Guinea","Haiti","Honduras","Indien","Indonesien","Irak","Iran","Irland","Island","Israel","Italien",
  "Jamaica","Japan","Jordanien","Kambodja","Kamerun","Kanada","Kap Verde","Kazakstan","Kenya","Kina","Kroatien","Kuba",
  "Kuwait","Laos","Lettland","Libanon","Libyen","Liechtenstein","Litauen","Luxemburg","Madagaskar","Malawi","Malaysia",
  "Maldiverna","Mali","Malta","Marocko","Mexiko","Moldavien","Monaco","Mongoliet","Montenegro","Moçambique","Myanmar",
  "Namibia","Nepal","Nederländerna","Nicaragua","Niger","Nigeria","Nordmakedonien","Norge","Nya Zeeland","Oman",
  "Pakistan","Palestina","Panama","Paraguay","Peru","Polen","Portugal","Qatar","Rumänien","Rwanda","Ryssland",
  "Saudiarabien","Schweiz","Senegal","Serbien","Singapore","Slovakien","Slovenien","Somalia","Spanien","Sri Lanka",
  "Storbritannien","Sudan","Sverige","Sydafrika","Sydkorea","Syrien","Tajikistan","Tanzania","Thailand","Tjeckien",
  "Togo","Trinidad och Tobago","Tunisien","Turkiet","Turkmenistan","Tyskland","Uganda","Ukraina","Ungern","Uruguay",
  "USA","Uzbekistan","Venezuela","Vietnam","Vitryssland","Zambia","Zimbabwe","Österrike",
];

function ContactLayoutPanel({ card: cardProp, onUpdate: onUpdateProp }: { card: Card; onUpdate: (updated: Card) => void }) {
  const [card, onUpdate] = useBufferedCard(cardProp, onUpdateProp);
  const [tab, setTab] = useState<"settings" | "layout">("settings");
  const ctConfig = getCardTypeConfig((card as any).cardType);
  const current: string = (card as any).layoutStyle ?? ctConfig.layouts[0].key;
  const hasImage = !!(card as any).image;

  const f = (key: string): string => (card as any)[key] ?? "";
  const set = (key: string, val: string) => onUpdate({ ...card, [key]: val || undefined } as any);
  const NOTES_MAX = 240;

  const ChevronDown = () => (
    <svg className="contact-select__chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="currentColor" d="m1.7 4 .36.35L7.71 10l5.64-5.65.36-.35.7.7-.35.36-6 6h-.7l-6-6L1 4.71 1.7 4Z" />
    </svg>
  );

  return (
    <div className="card-panel-body">
      <div className="card-panel-tabs">
        <button type="button"
          className={"card-panel-tab" + (tab === "settings" ? " card-panel-tab--active" : "")}
          onClick={() => setTab("settings")}>
          Inställningar
        </button>
        <button type="button"
          className={"card-panel-tab" + (tab === "layout" ? " card-panel-tab--active" : "")}
          onClick={() => setTab("layout")}>
          Layout
        </button>
        <div className={"card-panel-tab-indicator" + (tab === "layout" ? " card-panel-tab-indicator--right" : "")} />
      </div>

      {tab === "settings" && (
        <div className="card-panel-tab-content">
          <h3 className="card-panel-title">Kontaktuppgifter</h3>
          <p className="card-panel-desc">Visa dina kontaktuppgifter för besökare. Endast den information du anger kommer att visas.</p>

          {/* Namn */}
          <div className="tp-fields">
            <div className="tp-float-field">
              <input className="tp-float-input" placeholder=" " value={f("contactName")} onChange={e => set("contactName", e.target.value)} />
              <label className="tp-float-label">Namn</label>
            </div>
          </div>

          {/* E-post */}
          <label className="tp-field-label" style={{ marginTop: 20 }}>E-post</label>
          <div className="contact-row">
            <div className="tp-float-field contact-input--prefix">
              <input className="tp-float-input" placeholder=" " value={f("phone1Prefix")} onChange={e => set("phone1Prefix", e.target.value)} />
              <label className="tp-float-label">Avdelning</label>
            </div>
            <div className="tp-float-field contact-input--number">
              <input className="tp-float-input" placeholder=" " value={f("phone1Number")} onChange={e => set("phone1Number", e.target.value)} />
              <label className="tp-float-label">E-post</label>
            </div>
          </div>
          <div className="contact-row">
            <div className="tp-float-field contact-input--prefix">
              <input className="tp-float-input" placeholder=" " value={f("phone2Prefix")} onChange={e => set("phone2Prefix", e.target.value)} />
              <label className="tp-float-label">Avdelning</label>
            </div>
            <div className="tp-float-field contact-input--number">
              <input className="tp-float-input" placeholder=" " value={f("phone2Number")} onChange={e => set("phone2Number", e.target.value)} />
              <label className="tp-float-label">E-post</label>
            </div>
          </div>

          {/* Telefon */}
          <label className="tp-field-label" style={{ marginTop: 20 }}>Telefon</label>
          <div className="contact-row">
            <div className="tp-float-field contact-input--prefix">
              <input className="tp-float-input" placeholder=" " value={f("fax1Prefix")} onChange={e => set("fax1Prefix", e.target.value)} />
              <label className="tp-float-label">Avdelning</label>
            </div>
            <div className="tp-float-field contact-input--number">
              <input className="tp-float-input" placeholder=" " value={f("fax1Number")} onChange={e => set("fax1Number", e.target.value)} />
              <label className="tp-float-label">Telefonnummer</label>
            </div>
          </div>
          <div className="contact-row">
            <div className="tp-float-field contact-input--prefix">
              <input className="tp-float-input" placeholder=" " value={f("fax2Prefix")} onChange={e => set("fax2Prefix", e.target.value)} />
              <label className="tp-float-label">Avdelning</label>
            </div>
            <div className="tp-float-field contact-input--number">
              <input className="tp-float-input" placeholder=" " value={f("fax2Number")} onChange={e => set("fax2Number", e.target.value)} />
              <label className="tp-float-label">Telefonnummer</label>
            </div>
          </div>

          {/* Adress */}
          <label className="tp-field-label" style={{ marginTop: 20 }}>Adress</label>
          <div className="tp-fields">
            <div className="tp-float-field">
              <input className="tp-float-input" placeholder=" " value={f("addressLine1")} onChange={e => set("addressLine1", e.target.value)} />
              <label className="tp-float-label">Gatuadress</label>
            </div>
            <div className="tp-float-field">
              <input className="tp-float-input" placeholder=" " value={f("addressLine2")} onChange={e => set("addressLine2", e.target.value)} />
              <label className="tp-float-label">Gatuadress rad 2</label>
            </div>
          </div>
          <div className="contact-row contact-row--half">
            <div className="tp-float-field">
              <input className="tp-float-input" placeholder=" " value={f("zip")} onChange={e => set("zip", e.target.value)} />
              <label className="tp-float-label">Postnummer</label>
            </div>
            <div className="tp-float-field">
              <input className="tp-float-input" placeholder=" " value={f("city")} onChange={e => set("city", e.target.value)} />
              <label className="tp-float-label">Ort</label>
            </div>
          </div>
          <div className="tp-fields">
            <div className="tp-float-field">
              <input className="tp-float-input" placeholder=" " value={f("country")} onChange={e => set("country", e.target.value)} />
              <label className="tp-float-label">Land</label>
            </div>
          </div>

          {/* Öppettider */}
          <label className="tp-field-label" style={{ marginTop: 20 }}>Öppettider</label>
          <div className="tp-textarea-wrap">
            <textarea
              className="tp-textarea"
              placeholder="När har ni öppet?"
              value={f("notes")}
              maxLength={NOTES_MAX}
              rows={3}
              onChange={e => set("notes", e.target.value)}
            />
            <span className="tp-textarea-count">{f("notes").length}/{NOTES_MAX}</span>
          </div>
        </div>
      )}

      {tab === "layout" && (
        <div className="card-panel-tab-content">
          <div className="card-panel-options">
            {ctConfig.layouts.map((layout) => (
              <button key={layout.key} type="button"
                className={"card-layout-option" + (current === layout.key ? " card-layout-option--active" : "")}
                onClick={() => onUpdate({ ...card, layoutStyle: layout.key } as any)}>
                <div className="card-layout-option-left">
                  <div className={"card-layout-radio" + (current === layout.key ? " card-layout-radio--checked" : "")}>
                    {current === layout.key && <div className="card-layout-radio-dot" />}
                  </div>
                  <div>
                    <div className="card-layout-option-title">{layout.label}</div>
                    <div className="card-layout-option-sub">{layout.description}</div>
                    {layout.needsImage && !hasImage && <FeaturedUploadButton />}
                  </div>
                </div>
                <img src={layout.previewImage} alt={layout.label} className="card-layout-preview" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Custom layout panel components, keyed by CardTypeConfig.layoutPanelKey */
const CUSTOM_LAYOUT_PANELS: Record<string, (props: { card: Card; onUpdate: (updated: Card) => void }) => React.ReactNode> = {
  text: ({ card, onUpdate }) => <TextLayoutPanel card={card} onUpdate={onUpdate} />,
  document: ({ card, onUpdate }) => <DocumentLayoutPanel card={card} onUpdate={onUpdate} />,
  faq: ({ card, onUpdate }) => <FaqLayoutPanel card={card} onUpdate={onUpdate} />,
  contact: ({ card, onUpdate }) => <ContactLayoutPanel card={card} onUpdate={onUpdate} />,
};

function ImagePanelContent({ card, onUpdate }: { card: Card; onUpdate: (updated: Card) => void }) {
  return (
    <div className="card-panel-body card-panel-body--image">
      <p className="card-panel-desc">Omslagsbild som visas på kortet för gästerna.</p>
      <ImageUpload
        value={(card as any).image}
        folder="cards"
        shape="wide"
        variant="compact"
        onChange={(url) => onUpdate({ ...card, image: url } as Card)}
        onRemove={() => onUpdate({ ...card, image: undefined } as Card)}
      />
    </div>
  );
}

function BadgePanelContent({ card, onChange }: { card: Card; onChange: (badge: string) => void }) {
  const badge = (card as any).badge ?? "";
  const PRESETS = ["Nytt", "Populärt", "Begränsat", "Erbjudande", "Viktigt"];
  return (
    <div className="card-panel-body">
      <p className="card-panel-desc">Lägg till en badge som syns på kortet</p>
      <input className="card-panel-input" value={badge} onChange={e => onChange(e.target.value)}
        placeholder="t.ex. Nytt, Populärt..." maxLength={20} />
      <div className="card-panel-presets">
        {PRESETS.map(p => (
          <button key={p} type="button"
            className={"card-panel-preset" + (badge === p ? " card-panel-preset--active" : "")}
            onClick={() => { if (badge !== p) onChange(p); }}>
            <span>{p}</span>
            {badge === p && (
              <span className="card-panel-preset-clear" onClick={e => { e.stopPropagation(); onChange(""); }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

const MONTHS_SV = ["Januari","Februari","Mars","April","Maj","Juni","Juli","Augusti","September","Oktober","November","December"];
const DAYS_SV = ["Sön","Mån","Tis","Ons","Tor","Fre","Lör"];

function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDayOfMonth(year: number, month: number) { return new Date(year, month, 1).getDay(); }

type ScheduleDate = { year: number; month: number; day: number; hour: number; minute: number } | null;

function CalendarPopup({ value, min, onSelect, onClose, anchorRect }: {
  value: ScheduleDate; min?: ScheduleDate; onSelect: (d: ScheduleDate) => void; onClose: () => void; anchorRect: DOMRect | null;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(value?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(value?.month ?? today.getMonth());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [selDay, setSelDay] = useState(value?.day ?? null as number | null);
  const [hour, setHour] = useState(value?.hour ?? 12);
  const [minute, setMinute] = useState(value?.minute ?? 0);
  const ref = useRef<HTMLDivElement>(null);

  const [dropUp, setDropUp] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useLayoutEffect(() => {
    if (!ref.current || !anchorRect) return;
    const popupH = ref.current.offsetHeight;
    const spaceBelow = window.innerHeight - anchorRect.bottom - 6;
    const spaceAbove = anchorRect.top - 6;
    setDropUp(spaceBelow < popupH && spaceAbove > spaceBelow);
  }, [anchorRect, viewMonth, viewYear, showMonthPicker, showYearPicker]);

  const style: React.CSSProperties = anchorRect ? {
    position: "fixed",
    left: anchorRect.left,
    zIndex: 9999,
    ...(dropUp
      ? { bottom: window.innerHeight - anchorRect.top + 6 }
      : { top: anchorRect.bottom + 6 }),
  } : { position: "fixed", top: 100, left: 100, zIndex: 9999 };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const minDate = min ? new Date(min.year, min.month, min.day) : null;

  const isDisabled = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (d < todayMidnight) return true;
    if (minDate) { const m = new Date(minDate); m.setHours(0,0,0,0); if (d < m) return true; }
    return false;
  };

  const handleDayClick = (day: number) => {
    if (isDisabled(day)) return;
    setSelDay(day);
    onSelect({ year: viewYear, month: viewMonth, day, hour, minute });
    onClose();
  };

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };
  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() + i);

  return (
    <div className="sched-popup" ref={ref} style={style}>
      <div className="sched-popup-header">
        <button type="button" className="sched-nav-btn" onClick={prevMonth}>
          <ChevronIcon className="sched-chevron--left" />
        </button>
        <div className="sched-popup-title">
          <button type="button" className="sched-month-btn" onClick={() => { setShowMonthPicker(p => !p); setShowYearPicker(false); }}>
            {MONTHS_SV[viewMonth]}
            <ChevronIcon />
          </button>
          <button type="button" className="sched-month-btn" onClick={() => { setShowYearPicker(p => !p); setShowMonthPicker(false); }}>
            {viewYear}
            <ChevronIcon />
          </button>
        </div>
        <button type="button" className="sched-nav-btn" onClick={nextMonth}>
          <ChevronIcon className="sched-chevron--right" />
        </button>
      </div>
      {showMonthPicker && (
        <div className="sched-picker-dropdown">
          {MONTHS_SV.map((m, i) => (
            <button key={m} type="button" className={"sched-picker-item" + (i === viewMonth ? " sched-picker-item--active" : "")}
              onClick={() => { setViewMonth(i); setShowMonthPicker(false); }}>{m}</button>
          ))}
        </div>
      )}
      {showYearPicker && (
        <div className="sched-picker-dropdown">
          {years.map(y => (
            <button key={y} type="button" className={"sched-picker-item" + (y === viewYear ? " sched-picker-item--active" : "")}
              onClick={() => { setViewYear(y); setShowYearPicker(false); }}>{y}</button>
          ))}
        </div>
      )}
      <div className="sched-grid">
        {DAYS_SV.map(d => <div key={d} className="sched-day-label">{d}</div>)}
        {Array.from({ length: firstDay }, (_, i) => <div key={"e"+i} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const disabled = isDisabled(day);
          const selected = selDay === day;
          const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
          return (
            <button key={day} type="button" disabled={disabled}
              className={"sched-day" + (selected ? " sched-day--selected" : "") + (isToday && !selected ? " sched-day--today" : "") + (disabled ? " sched-day--disabled" : "")}
              onClick={() => handleDayClick(day)}>{day}</button>
          );
        })}
      </div>
      <div className="sched-time">
        <div className="sched-time-wrap">
          <select className="sched-time-select" value={hour} onChange={e => setHour(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, i) => i).map(h => <option key={h} value={h}>{String(h).padStart(2,"0")}</option>)}
          </select>
          <ChevronIcon className="sched-time-chevron" />
        </div>
        <div className="sched-time-wrap">
          <select className="sched-time-select" value={minute} onChange={e => setMinute(Number(e.target.value))}>
            {[0,15,30,45].map(m => <option key={m} value={m}>{String(m).padStart(2,"0")}</option>)}
          </select>
          <ChevronIcon className="sched-time-chevron" />
        </div>
      </div>
    </div>
  );
}

function formatScheduleDate(d: ScheduleDate): string {
  if (!d) return "";
  return `${d.day} ${MONTHS_SV[d.month].slice(0,3)} ${d.year}, ${String(d.hour).padStart(2,"0")}:${String(d.minute).padStart(2,"0")}`;
}

/** Convert ScheduleDate to ISO string in Europe/Stockholm timezone */
function scheduleToISO(d: ScheduleDate): string | undefined {
  if (!d) return undefined;
  // Build a date string and format it as Stockholm time
  // Pad to ISO-like format, then use the known UTC offset for Stockholm
  const pad = (n: number) => String(n).padStart(2, "0");
  const localStr = `${d.year}-${pad(d.month + 1)}-${pad(d.day)}T${pad(d.hour)}:${pad(d.minute)}:00`;
  // Create date interpreted as Stockholm time by using Intl to find the offset
  const probe = new Date(localStr + "Z"); // treat as UTC temporarily
  const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", timeZoneName: "shortOffset" });
  const parts = fmt.formatToParts(probe);
  const tzPart = parts.find(p => p.type === "timeZoneName")?.value ?? "+01";
  // Parse offset like "GMT+1" or "GMT+2"
  const match = tzPart.match(/([+-]?\d+)/);
  const offsetH = match ? parseInt(match[1], 10) : 1;
  // Build proper ISO: subtract offset to get UTC
  const utc = new Date(new Date(localStr).getTime());
  utc.setHours(utc.getHours() - offsetH);
  return utc.toISOString();
}

/** Convert ISO string to ScheduleDate for display */
function isoToSchedule(iso: string | undefined): ScheduleDate {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  // Convert to Stockholm time
  const sthlm = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Stockholm" }));
  return {
    year: sthlm.getFullYear(),
    month: sthlm.getMonth(),
    day: sthlm.getDate(),
    hour: sthlm.getHours(),
    minute: sthlm.getMinutes(),
  };
}

function SchedSpinner({ visible, variant }: { visible: boolean; variant?: "dark" }) {
  const [mounted, setMounted] = useState(false);
  const [animState, setAnimState] = useState<"enter" | "exit" | "idle">("idle");
  const prevVisible = useRef(visible);
  useEffect(() => {
    if (visible && !prevVisible.current) { setMounted(true); setAnimState("enter"); }
    else if (!visible && prevVisible.current) { setAnimState("exit"); }
    prevVisible.current = visible;
  }, [visible]);
  const handleAnimationEnd = () => {
    if (animState === "exit") { setMounted(false); setAnimState("idle"); }
    else if (animState === "enter") { setAnimState("idle"); }
  };
  if (!mounted) return null;
  return (
    <svg
      className={`sched-animated-spinner${variant === "dark" ? " sched-animated-spinner--dark" : ""}${animState === "exit" ? " sched-animated-spinner--out" : ""}`}
      width="21" height="21" viewBox="0 0 21 21" fill="none"
      onAnimationEnd={handleAnimationEnd}
    >
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
    </svg>
  );
}

function SchedulePanelContent({ card, onUpdate }: { card: Card; onUpdate: (updated: Card) => void }) {
  const isScheduled = !!(card.scheduledShow || card.scheduledHide);
  const initialShowRef = useRef<ScheduleDate>(isoToSchedule(card.scheduledShow));
  const initialHideRef = useRef<ScheduleDate>(isoToSchedule(card.scheduledHide));
  const [showFrom, setShowFrom] = useState<ScheduleDate>(() => initialShowRef.current);
  const [hideFrom, setHideFrom] = useState<ScheduleDate>(() => initialHideRef.current);
  const [openPicker, setOpenPicker] = useState<"show"|"hide"|null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [savingAction, setSavingAction] = useState<"save" | "cancel" | null>(null);
  const saving = savingAction !== null;
  const showRef = useRef<HTMLButtonElement>(null);
  const hideRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (openPicker === "show" && showRef.current) setAnchorRect(showRef.current.getBoundingClientRect());
    if (openPicker === "hide" && hideRef.current) setAnchorRect(hideRef.current.getBoundingClientRect());
  }, [openPicker]);

  const scheduleDatesEqual = (a: ScheduleDate, b: ScheduleDate) => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour && a.minute === b.minute;
  };

  const hasDate = !!(showFrom || hideFrom);
  const hasChanges = !scheduleDatesEqual(showFrom, initialShowRef.current)
    || !scheduleDatesEqual(hideFrom, initialHideRef.current);

  const handleSave = () => {
    setSavingAction("save");
    const updated = { ...card } as any;
    const showISO = scheduleToISO(showFrom);
    const hideISO = scheduleToISO(hideFrom);
    if (showISO) updated.scheduledShow = showISO; else delete updated.scheduledShow;
    if (hideISO) updated.scheduledHide = hideISO; else delete updated.scheduledHide;
    if (showISO) updated.isActive = true;
    initialShowRef.current = showFrom;
    initialHideRef.current = hideFrom;
    setTimeout(() => { onUpdate(updated as Card); setSavingAction(null); }, 600);
  };

  const handleCancel = () => {
    setSavingAction("cancel");
    const updated = { ...card } as any;
    delete updated.scheduledShow;
    delete updated.scheduledHide;
    setTimeout(() => {
      onUpdate(updated as Card);
      setShowFrom(null);
      setHideFrom(null);
      setSavingAction(null);
    }, 600);
  };

  return (
    <div className="card-panel-body">
      <h3 className="card-panel-title">Schemalägg länk</h3>
      <p className="card-panel-desc">Välj datum för att visa eller dölja kortet för gäster.</p>
      <div className="sched-row">
        <div className="sched-picker-wrap">
          <button type="button"
            className={"sched-trigger" + (openPicker === "show" ? " sched-trigger--open" : "") + (showFrom ? " sched-trigger--set" : "")}
            ref={showRef} onClick={() => setOpenPicker(p => p === "show" ? null : "show")}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="#2d2c2b" viewBox="0 0 16 16" width="16" height="16">
              <g><path fill="none" stroke="#2d2c2b" strokeLinecap="round" strokeLinejoin="round" d="M3.5.5v2M10.5.5v2M11.5 9.5v2h2"/>
              <circle cx="11.5" cy="11.5" r="4" fill="none" stroke="#2d2c2b" strokeLinecap="round" strokeLinejoin="round"/>
              <path fill="none" stroke="#2d2c2b" strokeLinecap="round" strokeLinejoin="round" d="M13.5 5.85V2.5a1 1 0 00-1-1h-11a1 1 0 00-1 1v10a1 1 0 001 1h4.351"/></g>
            </svg>
            <span className="sched-trigger-text">
              {showFrom && <span className="sched-trigger-label">Visa från</span>}
              <span className="sched-trigger-value">{showFrom ? formatScheduleDate(showFrom) : "Visa från"}</span>
            </span>
            <ChevronIcon />
          </button>
          {openPicker === "show" && typeof window !== "undefined" && createPortal(
            <CalendarPopup value={showFrom} anchorRect={anchorRect} onSelect={d => { setShowFrom(d); setOpenPicker(null); }} onClose={() => setOpenPicker(null)} />,
            document.body
          )}
        </div>
        <div className="sched-picker-wrap">
          <button type="button"
            className={"sched-trigger" + (openPicker === "hide" ? " sched-trigger--open" : "") + (hideFrom ? " sched-trigger--set" : "")}
            ref={hideRef} onClick={() => setOpenPicker(p => p === "hide" ? null : "hide")}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="#2d2c2b" viewBox="0 0 16 16" width="16" height="16">
              <g><path fill="none" stroke="#2d2c2b" strokeLinecap="round" strokeLinejoin="round" d="M3.5.5v2M10.5.5v2M11.5 9.5v2h2"/>
              <circle cx="11.5" cy="11.5" r="4" fill="none" stroke="#2d2c2b" strokeLinecap="round" strokeLinejoin="round"/>
              <path fill="none" stroke="#2d2c2b" strokeLinecap="round" strokeLinejoin="round" d="M13.5 5.85V2.5a1 1 0 00-1-1h-11a1 1 0 00-1 1v10a1 1 0 001 1h4.351"/></g>
            </svg>
            <span className="sched-trigger-text">
              {hideFrom && <span className="sched-trigger-label">Dölj från</span>}
              <span className="sched-trigger-value">{hideFrom ? formatScheduleDate(hideFrom) : "Dölj från"}</span>
            </span>
            <ChevronIcon />
          </button>
          {openPicker === "hide" && typeof window !== "undefined" && createPortal(
            <CalendarPopup value={hideFrom} min={showFrom ?? undefined} anchorRect={anchorRect} onSelect={d => { setHideFrom(d); setOpenPicker(null); }} onClose={() => setOpenPicker(null)} />,
            document.body
          )}
        </div>
      </div>
      {isScheduled ? (
        <div className="sched-actions">
          <button type="button"
            className="sched-cancel-btn"
            disabled={saving}
            style={saving ? { pointerEvents: "none" } : undefined}
            onClick={handleCancel}>
            <SchedSpinner visible={savingAction === "cancel"} variant="dark" />
            <span className="sched-btn-label">Avbryt schemaläggning</span>
          </button>
          <button type="button"
            className={"sched-save-btn" + (hasChanges ? " sched-save-btn--active" : "")}
            disabled={!hasChanges || saving}
            style={saving ? { pointerEvents: "none" } : undefined}
            onClick={handleSave}>
            <SchedSpinner visible={savingAction === "save"} />
            <span className="sched-btn-label">Spara ändringar</span>
          </button>
        </div>
      ) : (
        <div className="sched-actions">
          <button type="button"
            className={"sched-save-btn" + (hasDate && hasChanges ? " sched-save-btn--active" : "")}
            disabled={!hasDate || !hasChanges || saving}
            style={saving ? { pointerEvents: "none" } : undefined}
            onClick={handleSave}>
            <SchedSpinner visible={savingAction === "save"} />
            <span className="sched-btn-label">Schemalägg</span>
          </button>
        </div>
      )}
    </div>
  );
}



// ── Back Button ───────────────────────────────────────────────────
const BackButton = ({ onClick }: { onClick: () => void }) => (
  <button type="button" className="admin-back-btn" onClick={onClick} aria-label="Tillbaka">
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" viewBox="0 0 256 256">
      <path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z"/>
    </svg>
  </button>
);

// ── Confirm Spinner (matches Publicera) ──────────────────────────
function ConfirmSpinner({ visible, variant }: { visible: boolean; variant?: "dark" }) {
  const [mounted, setMounted] = useState(false);
  const [animState, setAnimState] = useState<"enter" | "exit" | "idle">("idle");
  const prevVisible = useRef(visible);
  useEffect(() => {
    if (visible && !prevVisible.current) { setMounted(true); setAnimState("enter"); }
    else if (!visible && prevVisible.current) { setAnimState("exit"); }
    prevVisible.current = visible;
  }, [visible]);
  const handleAnimationEnd = () => {
    if (animState === "exit") { setMounted(false); setAnimState("idle"); }
    else if (animState === "enter") { setAnimState("idle"); }
  };
  if (!mounted) return null;
  return (
    <svg
      className={`confirm-spinner${variant === "dark" ? " confirm-spinner--dark" : ""}${animState === "exit" ? " confirm-spinner--out" : ""}`}
      width="21" height="21" viewBox="0 0 21 21" fill="none"
      onAnimationEnd={handleAnimationEnd}
    >
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
    </svg>
  );
}

// ── Confirm Dialog ────────────────────────────────────────────────
function ConfirmDialog({ title, description, confirmLabel = "Bekräfta", danger = false, onConfirm, onCancel }: {
  title: string; description: string; confirmLabel?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  const [loadingAction, setLoadingAction] = useState<"confirm" | "cancel" | null>(null);
  const loading = loadingAction !== null;

  const handleConfirm = () => {
    setLoadingAction("confirm");
    setTimeout(() => { onConfirm(); }, 500);
  };
  const handleCancel = () => {
    setLoadingAction("cancel");
    setTimeout(() => { onCancel(); }, 400);
  };

  return createPortal(
    <>
      <div className="confirm-backdrop" onClick={loading ? undefined : onCancel} />
      <div className="confirm-dialog">
        <div className="confirm-icon">{danger ? "🗑️" : "⚠️"}</div>
        <div className="confirm-title">{title}</div>
        <div className="confirm-desc">{description}</div>
        <div className="confirm-actions">
          <button type="button" className="confirm-btn confirm-btn--cancel" disabled={loading} onClick={handleCancel}>
            <ConfirmSpinner visible={loadingAction === "cancel"} variant="dark" />
            <span className="confirm-btn-label">Avbryt</span>
          </button>
          <button type="button" className={"confirm-btn" + (danger ? " confirm-btn--danger" : " confirm-btn--primary")} disabled={loading} onClick={handleConfirm}>
            <ConfirmSpinner visible={loadingAction === "confirm"} />
            <span className="confirm-btn-label">{confirmLabel}</span>
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

// ── Archive Section ───────────────────────────────────────────────
function ArchiveSection({ archivedCards, onRestore, onPermanentDelete }: {
  archivedCards: ArchivedCard[];
  onRestore: (card: ArchivedCard) => void;
  onPermanentDelete: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  if (archivedCards.length === 0) return null;
  return (
    <div className="archive-section">
      <button type="button" className="archive-toggle" onClick={() => setIsOpen(p => !p)}>
        <div className="archive-toggle-left">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>
          </svg>
          <span>Arkiv</span>
          <span className="archive-count">{archivedCards.length}</span>
        </div>
        <svg className={"archive-chevron" + (isOpen ? " archive-chevron--open" : "")}
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      <div className={"archive-list" + (isOpen ? " archive-list--open" : "")}>
        <div className="archive-list-inner">
          {archivedCards.map(card => (
            <div key={card.id} className="archive-card">
              <div className="archive-card-info">
                <span className="archive-card-title">{card.title}</span>
                <span className="archive-card-meta">
                  Arkiverad {new Date(card.archivedAt).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
              <div className="archive-card-actions">
                <button type="button" className="archive-btn archive-btn--restore" onClick={() => onRestore(card)}>
                  Återställ
                </button>
                <button type="button" className="archive-btn archive-btn--delete" onClick={() => setConfirmDelete(card.id)}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path fillRule="evenodd" d="m6.83 0-.35.15-1.33 1.33-.15.35V3H0v1h2v11.5l.5.5h11l.5-.5V4h2V3h-5V1.83l-.15-.35L9.52.15 9.17 0H6.83ZM10 3v-.96L8.96 1H7.04L6 2.04V3h4ZM5 4H3v11h10V4H5Zm2 3v5H6V7h1Zm3 .5V7H9v5h1V7.5Z" fill="currentColor"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="Ta bort permanent"
          description="Kortet raderas för alltid och kan inte återställas. Är du säker?"
          confirmLabel="Ta bort"
          danger
          onConfirm={() => { onPermanentDelete(confirmDelete); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}


// ── ArchivedCardItem ──────────────────────────────────────────────
function ArchivedCardItem({ card, onDelete, onRestore }: {
  card: ArchivedCard; onDelete: () => void; onRestore: () => void;
}) {
  const [openPanel, setOpenPanel] = useState<"delete" | "restore" | null>(null);
  const ctConfig = getCardTypeConfig((card as any).cardType);
  const sub = ctConfig.adminSubText?.(card) ?? "";
  return (
    <div className={"home-card" + (openPanel ? " home-card--expanded" : "")}>
      <div className="home-card-top">
        <div className="home-card-body">
          <div className="home-card-row1">
            <span className="home-card-title">{card.title}</span>
          </div>
          <div className="home-card-row2">
            <span className="home-card-sub">{sub}</span>
          </div>
          <div className="home-card-row3">
            <div className="home-card-icons">
              <button type="button"
                className={"home-card-icon-btn" + (openPanel === "restore" ? " home-card-icon-btn--active" : "")}
                title="Avarkivera" onClick={() => setOpenPanel(p => p === "restore" ? null : "restore")}>
                <RestoreIcon />
              </button>
            </div>
            <button type="button"
              className={"home-card-icon-btn home-card-trash" + (openPanel === "delete" ? " home-card-icon-btn--active home-card-icon-btn--active-danger" : "")}
              onClick={() => setOpenPanel(p => p === "delete" ? null : "delete")} aria-label="Ta bort">
              <TrashIcon />
            </button>
          </div>
        </div>
      </div>
      <div className={"home-card-panel" + (openPanel ? " home-card-panel--open" : "")}>
        <div className="home-card-panel-inner">
          <div className="home-card-panel-header">
            <div style={{ width: 26, flexShrink: 0 }} />
            <span className="home-card-panel-label">{openPanel === "delete" ? "Ta bort" : "Avarkivera"}</span>
            <button type="button" className="home-card-panel-close" onClick={() => setOpenPanel(null)}>
              <CloseIcon />
            </button>
          </div>
          <PanelContentWrapper panelKey={openPanel}>
            {openPanel === "delete" && <DeletePanelContent onDelete={onDelete} onArchive={() => setOpenPanel(null)} />}
            {openPanel === "restore" && <RestorePanelContent onRestore={onRestore} onCancel={() => setOpenPanel(null)} />}
          </PanelContentWrapper>
        </div>
      </div>
    </div>
  );
}

// ── SortableCardItem — dnd-kit wrapper ────────────────────────────
function SortableCardItem({ card, openPanel, onPanelToggle, onToggle, onDelete, onArchive, onUpdate }: {
  card: Card;
  openPanel: PanelKey;
  onPanelToggle: (id: string, key: Exclude<PanelKey, null>) => void;
  onToggle: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onUpdate: (updated: Card) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.04 : 1,
    boxShadow: isDragging ? "none" : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <CardItem
        card={card}
        openPanel={openPanel}
        onPanelToggle={onPanelToggle}
        onToggle={onToggle}
        onDelete={onDelete}
        onArchive={onArchive}
        onUpdate={onUpdate}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function CardItem({ card, onToggle, onDelete, onArchive, onUpdate, openPanel, onPanelToggle, dragHandleProps }: {
  card: Card; onToggle: () => void; onDelete: () => void; onArchive: () => void; onUpdate: (updated: Card) => void;
  openPanel: PanelKey; onPanelToggle: (id: string, key: Exclude<PanelKey, null>) => void;
  dragHandleProps?: Record<string, unknown>;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const titleInputRef = useRef<HTMLSpanElement>(null);
  const urlInputRef = useRef<HTMLSpanElement>(null);
  const panelContentRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState<number | undefined>();
  const panelReadyRef = useRef(false);

  useEffect(() => {
    const el = panelContentRef.current;
    if (!el || !openPanel) {
      setPanelHeight(undefined);
      panelReadyRef.current = false;
      return;
    }

    if (panelReadyRef.current) {
      const frame = requestAnimationFrame(() => setPanelHeight(el.scrollHeight));
      const ro = new ResizeObserver(() => setPanelHeight(el.scrollHeight));
      ro.observe(el);
      return () => { cancelAnimationFrame(frame); ro.disconnect(); };
    }

    // Initial open — wait for grid animation before measuring
    let ro: ResizeObserver | null = null;
    const timeout = setTimeout(() => {
      panelReadyRef.current = true;
      setPanelHeight(el.scrollHeight);
      ro = new ResizeObserver(() => setPanelHeight(el.scrollHeight));
      ro.observe(el);
    }, 1050);
    return () => { clearTimeout(timeout); ro?.disconnect(); };
  }, [openPanel]);

  const ctConfig = getCardTypeConfig((card as any).cardType);
  const sub = ctConfig.adminSubText?.(card) ?? "";

  const handleTitleBlur = () => {
    setEditingTitle(false);
    const el = titleInputRef.current;
    const newVal = (el?.textContent ?? "").trim();
    if (newVal && newVal !== card.title) {
      onUpdate({ ...card, title: newVal });
    } else if (el) {
      el.textContent = card.title;
    }
  };

  const handleUrlBlur = () => {
    setEditingUrl(false);
    const el = urlInputRef.current;
    const newVal = (el?.textContent ?? "").trim();
    const key = card.type === "download" ? "fileUrl" : card.type === "email" ? "email" : card.type === "phone" ? "phone" : "url";
    if (newVal !== ((card as any)[key] ?? "")) {
      onUpdate({ ...card, [key]: newVal } as Card);
    } else if (el) {
      el.textContent = sub;
    }
  };

  const cardTypeConfig = getCardTypeConfig((card as any).cardType);

  const layoutPanel = cardTypeConfig.layoutPanelKey
    ? (CUSTOM_LAYOUT_PANELS[cardTypeConfig.layoutPanelKey]?.({ card, onUpdate }) ?? <LayoutPanelContent card={card} onChange={l => onUpdate({ ...card, layoutStyle: l } as any)} />)
    : <LayoutPanelContent card={card} onChange={l => onUpdate({ ...card, layoutStyle: l } as any)} />;

  const livePanelContent =
    openPanel === "layout"   ? layoutPanel :
    openPanel === "image"    ? <ImagePanelContent card={card} onUpdate={onUpdate} /> :
    openPanel === "badge"    ? <BadgePanelContent card={card} onChange={b => onUpdate({ ...card, badge: b || undefined })} /> :
    openPanel === "schedule" ? <SchedulePanelContent card={card} onUpdate={onUpdate} /> :
    openPanel === "delete"   ? <DeletePanelContent onDelete={onDelete} onArchive={onArchive} /> : null;

  // Keep last content rendered during close animation
  const lastPanelContentRef = useRef<React.ReactNode>(null);
  if (livePanelContent !== null) {
    lastPanelContentRef.current = livePanelContent;
  }
  const panelContent = livePanelContent ?? lastPanelContentRef.current;

  const PANEL_ICON_MAP: Record<string, React.ReactNode> = {
    layout: <LayoutIcon />, image: <ImageIcon />, badge: <StarIcon />, schedule: <CalendarIcon />,
  };
  const iconDefs: { key: Exclude<PanelKey, null>; icon: React.ReactNode }[] =
    cardTypeConfig.adminPanels
      .filter((k): k is Exclude<PanelKey, null> & RegistryPanelKey => k !== "delete" && k in PANEL_ICON_MAP)
      .map(k => ({ key: k as Exclude<PanelKey, null>, icon: cardTypeConfig.panelIcons?.[k] ?? PANEL_ICON_MAP[k] }));

  const isHeader = (card as any).cardType === "header";
  const titlePlaceholder = isHeader ? "Skriv rubrik här" : "Rubrik";
  const titleMaxLen = isHeader ? 35 : undefined;

  const cardWarning = cardTypeConfig.warning?.(card) ?? null;

  return (
    <div className={"home-card" + (openPanel ? " home-card--expanded" : "") + (isHeader ? " home-card--header" : "") + (cardWarning && !openPanel ? " home-card--warning" : "")}>
      <div className="home-card-top">
        <div className="home-card-drag" {...(dragHandleProps ?? {})} title="Dra för att sortera">
          <DragIcon />
        </div>
        <div className="home-card-body">
          <div className="home-card-row1">
            <span
              ref={titleInputRef}
              className={"home-card-title" + (!card.title ? " home-card-title--empty" : "")}
              contentEditable={editingTitle}
              suppressContentEditableWarning
              data-placeholder={titlePlaceholder}
              onBlur={handleTitleBlur}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLElement).blur(); return; }
                if (e.key === "Escape") { (e.target as HTMLElement).textContent = card.title; setEditingTitle(false); return; }
                if (titleMaxLen && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
                  const text = (e.target as HTMLElement).textContent ?? "";
                  const sel = window.getSelection();
                  const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed;
                  if (text.length >= titleMaxLen && !hasSelection) e.preventDefault();
                }
              }}
              onInput={titleMaxLen ? (e => {
                const el = e.currentTarget;
                if ((el.textContent ?? "").length > titleMaxLen) {
                  el.textContent = (el.textContent ?? "").slice(0, titleMaxLen);
                  // Move cursor to end
                  const range = document.createRange();
                  range.selectNodeContents(el);
                  range.collapse(false);
                  const sel = window.getSelection();
                  sel?.removeAllRanges();
                  sel?.addRange(range);
                }
              }) : undefined}
            >{card.title}</span>
            {(card as any).badge && !editingTitle && <span className="home-card-badge">{(card as any).badge}</span>}
            {!editingTitle && (
              <button type="button" className="home-card-icon-btn" aria-label="Redigera titel"
                onClick={() => { setEditingTitle(true); setTimeout(() => { const el = titleInputRef.current; if (el) { el.focus(); const range = document.createRange(); range.selectNodeContents(el); const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range); } }, 0); }}>
                <PenIcon />
              </button>
            )}
          </div>
          {cardTypeConfig.showAdminSubRow !== false && (
          <div className="home-card-row2">
            <span
              ref={urlInputRef}
              className={"home-card-sub" + (!sub ? " home-card-sub--empty" : "")}
              contentEditable={editingUrl}
              suppressContentEditableWarning
              data-placeholder={cardTypeConfig.adminSubPlaceholder ?? "URL"}
              onBlur={handleUrlBlur}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLElement).blur(); } if (e.key === "Escape") { (e.target as HTMLElement).textContent = sub; setEditingUrl(false); } }}
            >{sub}</span>
            {!editingUrl && (
              <button type="button" className="home-card-icon-btn" aria-label="Redigera URL"
                onClick={() => { setEditingUrl(true); setTimeout(() => { const el = urlInputRef.current; if (el) { el.focus(); const range = document.createRange(); range.selectNodeContents(el); const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range); } }, 0); }}>
                <PenIcon />
              </button>
            )}
          </div>
          )}
          {(() => {
            const now = Date.now();
            const showTime = card.scheduledShow ? new Date(card.scheduledShow).getTime() : null;
            const hideTime = card.scheduledHide ? new Date(card.scheduledHide).getTime() : null;
            const isCurrentlyShowing = !showTime || showTime <= now;
            const expiresWithin2Days = hideTime && hideTime > now && (hideTime - now) <= 2 * 24 * 60 * 60 * 1000;

            if (isCurrentlyShowing && expiresWithin2Days) {
              return (
                <div className="home-card-schedule-badge home-card-schedule-badge--expiring">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fillRule="evenodd" d="M5 .5V0H4v2H.5l-.5.5v12l.5.5h15l.5-.5v-12l-.5-.5H12V0h-1v2H5V.5ZM4 3v1h1V3h6v1h1V3h3v3H1V3h3ZM1 7v7h14V7H1Z" fill="currentColor"/></svg>
                  <span>Slutar att visas {formatScheduleDate(isoToSchedule(card.scheduledHide))}</span>
                </div>
              );
            }
            if (card.scheduledShow && showTime && showTime > now) {
              return (
                <div className="home-card-schedule-badge">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fillRule="evenodd" d="M5 .5V0H4v2H.5l-.5.5v12l.5.5h15l.5-.5v-12l-.5-.5H12V0h-1v2H5V.5ZM4 3v1h1V3h6v1h1V3h3v3H1V3h3ZM1 7v7h14V7H1Z" fill="currentColor"/></svg>
                  <span>Schemalagd {formatScheduleDate(isoToSchedule(card.scheduledShow))}</span>
                </div>
              );
            }
            return null;
          })()}
          <div className="home-card-row3">
            <div className="home-card-icons">
              {iconDefs.map(({ key, icon }) => (
                <button key={key} type="button"
                  className={"home-card-icon-btn" + (openPanel === key ? " home-card-icon-btn--active" : "") + (key === "image" && (card as any).image ? " home-card-icon-btn--has-image" : "")}
                  title={PANEL_LABELS[key]} onClick={() => onPanelToggle(card.id, key)}>
                  {icon}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="home-card-toggle">
          <Toggle checked={card.isActive} onChange={onToggle} />
          <button type="button" className={"home-card-icon-btn home-card-trash" + (openPanel === "delete" ? " home-card-icon-btn--active home-card-icon-btn--active-danger" : "")} onClick={() => onPanelToggle(card.id, "delete")} aria-label="Ta bort">
            <TrashIcon />
          </button>
        </div>
      </div>
      <div className={"home-card-panel" + (openPanel ? " home-card-panel--open" : "")}>
        <div className="home-card-panel-inner" style={openPanel && panelHeight != null ? { height: panelHeight } : undefined}>
          <div ref={panelContentRef}>
            <div className="home-card-panel-header">
              <div style={{ width: 26, flexShrink: 0 }} />
              <span className="home-card-panel-label">{openPanel ? PANEL_LABELS[openPanel] : ""}</span>
              <button type="button" className="home-card-panel-close"
                onClick={() => { if (openPanel) onPanelToggle(card.id, openPanel as Exclude<PanelKey, null>); }}>
                <CloseIcon />
              </button>
            </div>
            <PanelContentWrapper panelKey={openPanel}>
              {panelContent}
            </PanelContentWrapper>
          </div>
        </div>
      </div>
      {cardWarning && !openPanel && (
        <div className="home-card-warning">
          <div className="home-card-warning-text">
            <span className="home-card-warning-title">{cardWarning.title}</span>
            <span className="home-card-warning-desc">{cardWarning.description}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const SortableCategoryCardItem = React.memo(function SortableCategoryCardItem({ card, onToggle, onUpdate, onAddCard, allCards, onDelete, onArchive, onUngroup, onDeleteCategory }: {
  card: Card;
  onToggle: (id: string) => void;
  onUpdate: (updated: Card) => void;
  onAddCard: (atIndex?: number) => void;
  allCards: Card[];
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onUngroup: () => void;
  onDeleteCategory: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const wasDraggingRef = useRef(false);
  const [expanding, setExpanding] = useState(false);

  useLayoutEffect(() => {
    if (wasDraggingRef.current && !isDragging) {
      setExpanding(true);
      const t = setTimeout(() => setExpanding(false), 250);
      return () => clearTimeout(t);
    }
    wasDraggingRef.current = isDragging;
  }, [isDragging]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.04 : 1,
    boxShadow: isDragging ? "none" : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <CategoryCardItem
        card={card}
        collapsed={isDragging}
        expanding={expanding}
        onToggle={onToggle}
        onUpdate={onUpdate}
        onAddCard={onAddCard}
        allCards={allCards}
        onDelete={onDelete}
        onArchive={onArchive}
        onUngroup={onUngroup}
        onDeleteCategory={onDeleteCategory}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
});

function CategoryCardItem({ card, onToggle, onUpdate, onAddCard, allCards, onDelete, onArchive, onUngroup, onDeleteCategory, dragHandleProps, collapsed, expanding }: {
  card: Card;
  onToggle: (id: string) => void;
  onUpdate: (updated: Card) => void;
  onAddCard: (atIndex?: number) => void;
  allCards?: Card[];
  onDelete?: (id: string) => void;
  onArchive?: (id: string) => void;
  onUngroup?: () => void;
  onDeleteCategory?: () => void;
  dragHandleProps?: Record<string, unknown>;
  collapsed?: boolean;
  expanding?: boolean;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreClosing, setMoreClosing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"ungroup" | "delete" | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const closeMore = useCallback(() => {
    setMoreClosing(true);
    setTimeout(() => { setMoreOpen(false); setMoreClosing(false); }, 150);
  }, []);
  useEffect(() => {
    if (!moreOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) closeMore();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [moreOpen, closeMore]);
  const [activeChildCard, setActiveChildCard] = useState<string | null>(null);
  const [activeChildPanel, setActiveChildPanel] = useState<PanelKey>(null);
  const handleChildPanelToggle = useCallback((id: string, key: Exclude<PanelKey, null>) => {
    if (activeChildCard === id && activeChildPanel === key) {
      setActiveChildPanel(null);
      setActiveChildCard(null);
    } else {
      setActiveChildCard(id);
      setActiveChildPanel(key);
    }
  }, [activeChildCard, activeChildPanel]);
  const titleInputRef = useRef<HTMLSpanElement>(null);

  const currentLayout = (card as any).layout ?? "stack";
  const currentLayoutDef = CATEGORY_LAYOUTS.find(l => l.key === currentLayout) ?? CATEGORY_LAYOUTS[0];

  const handleTitleBlur = () => {
    setEditingTitle(false);
    const el = titleInputRef.current;
    const newVal = (el?.textContent ?? "").trim();
    if (newVal && newVal !== card.title) {
      onUpdate({ ...card, title: newVal } as Card);
    } else if (el) {
      el.textContent = card.title || "Samlingens namn";
    }
  };

  return (
    <div className={"home-category-card" + (collapsed ? " home-category-card--collapsed" : "") + (expanding ? " home-category-card--expanding" : "")} data-category-id={(card as any).id}>
      {/* ── Header ── */}
      <div className="home-category-card-header">

        {/* Left: drag handle + layout btn */}
        <div className="home-category-card-left">
          <div className="home-card-drag" {...(dragHandleProps ?? {})} title="Dra för att sortera">
            <DragIcon />
          </div>
          <button
            type="button"
            className={"home-category-layout-btn" + (layoutOpen ? " home-category-layout-btn--active" : "")}
            onClick={() => setLayoutOpen(v => !v)}
          >
            <span className="home-category-layout-icon">{currentLayoutDef.icon}</span>
            <span className="home-category-layout-label">Layout</span>
          </button>
        </div>

        {/* Center: category name */}
        <div className="home-category-card-center">
          <span
            ref={titleInputRef}
            className={"home-category-title" + (!card.title && !editingTitle ? " home-category-title--placeholder" : "")}
            contentEditable={editingTitle}
            suppressContentEditableWarning
            onBlur={handleTitleBlur}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLElement).blur(); }
              if (e.key === "Escape") { (e.target as HTMLElement).textContent = card.title || "Samlingens namn"; setEditingTitle(false); }
            }}
          >{card.title || "Samlingens namn"}</span>
          {!editingTitle && (
            <button type="button" className="home-card-icon-btn" aria-label="Redigera kategorinamn"
              onClick={() => { setEditingTitle(true); setTimeout(() => { const el = titleInputRef.current; if (el) { if (!card.title) el.textContent = ""; el.focus(); const range = document.createRange(); range.selectNodeContents(el); const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range); } }, 0); }}>
              <PenIcon />
            </button>
          )}
        </div>

        {/* Right: add, more, toggle */}
        <div className="home-category-card-right">
          <button type="button" className="home-card-icon-btn" aria-label="Lägg till kort" onClick={() => onAddCard()}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#1a1a1a" viewBox="0 0 256 256">
              <line x1="40" y1="128" x2="216" y2="128" stroke="#1a1a1a" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16"/>
              <line x1="128" y1="40" x2="128" y2="216" stroke="#1a1a1a" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16"/>
            </svg>
          </button>
          <div className="home-category-more-wrap" ref={moreRef}>
            <button type="button" className="home-card-icon-btn" aria-label="Fler alternativ" onClick={() => moreOpen ? closeMore() : setMoreOpen(true)}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#1a1a1a" viewBox="0 0 256 256">
                <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm12-88a12,12,0,1,1-12-12A12,12,0,0,1,140,128Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,184,128Zm-88,0a12,12,0,1,1-12-12A12,12,0,0,1,96,128Z"/>
              </svg>
            </button>
            {moreOpen && (
              <div className={"home-category-more-popup" + (moreClosing ? " home-category-more-popup--closing" : "")}>
                <button type="button" className="home-category-more-item" onClick={() => {
                  closeMore();
                  const hasChildren = ((card as any).cardIds ?? []).length > 0;
                  if (hasChildren) { setConfirmAction("ungroup"); } else { onUngroup?.(); }
                }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256"><path d="M224,160V96a8,8,0,0,0-8-8H168V40a8,8,0,0,0-8-8H40a8,8,0,0,0-8,8V160a8,8,0,0,0,8,8H88v48a8,8,0,0,0,8,8H216a8,8,0,0,0,8-8V160Zm-60.69,48-40-40h33.38l40,40ZM168,156.69V123.31l40,40v33.38Zm40-16L171.31,104H208ZM48,48H152v56h0v48H48Zm56,123.31L140.69,208H104Z"/></svg>
                  Avgruppera
                </button>
                <button type="button" className="home-category-more-item" onClick={() => {
                  closeMore();
                  const hasChildren = ((card as any).cardIds ?? []).length > 0;
                  if (hasChildren) { setConfirmAction("delete"); } else { onDeleteCategory?.(); }
                }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256"><path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"/></svg>
                  Ta bort
                </button>
              </div>
            )}
          </div>
          <div className="home-card-toggle">
            <Toggle checked={card.isActive} onChange={() => onToggle(card.id)} />
          </div>
        </div>
      </div>

      {/* ── Layout picker ── */}
      {layoutOpen && (
        <div className="home-category-layout-picker">
          <span className="home-category-layout-picker-title">Visa som</span>
          <div className="home-category-layout-picker-options">
            {CATEGORY_LAYOUTS.map(l => (
              <div key={l.key} className={"home-category-layout-option" + (currentLayout === l.key ? " home-category-layout-option--active" : "")}>
                <button
                  type="button"
                  className="home-category-layout-option-btn"
                  onClick={() => { onUpdate({ ...card, layout: l.key } as any); }}
                >
                  <div className="home-category-layout-option-icon">{l.icon}</div>
                </button>
                <span className="home-category-layout-option-label">{l.label}</span>
              </div>
            ))}
          </div>
          <div className="home-category-layout-picker-divider" />
          <p className="home-category-layout-picker-desc">{currentLayoutDef.description}</p>
        </div>
      )}

      {/* ── Body ── */}
      <div className="home-category-card-body">
        {(() => {
          const cardIds: string[] = (card as any).cardIds ?? [];
          const childCards = cardIds
            .map(id => (allCards ?? []).find(c => c.id === id))
            .filter((c): c is Card => !!c);

          if (childCards.length === 0) {
            return (
              <div className="home-category-card-empty">
                <p className="home-category-empty-text">Lägg till en ny länk eller dra och släpp en befintlig länk i den här samlingen.</p>
                <button type="button" className="home-category-empty-btn" onClick={() => onAddCard()}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                  Lägg till länk
                </button>
              </div>
            );
          }

          return (
            <SortableContext items={childCards.map(c => c.id)} strategy={verticalListSortingStrategy}>
              <div className="home-category-card-items">
                {childCards.map((child, idx) => (
                  <React.Fragment key={child.id}>
                    {idx === 0 && (
                      <CardDivider variant="category" onClick={() => onAddCard(0)} />
                    )}
                    <SortableCardItem
                      card={child}
                      openPanel={activeChildCard === child.id ? activeChildPanel : null}
                      onPanelToggle={handleChildPanelToggle}
                      onToggle={() => onToggle(child.id)}
                      onDelete={() => onDelete?.(child.id)}
                      onArchive={() => onArchive?.(child.id)}
                      onUpdate={onUpdate}
                    />
                    <CardDivider variant="category" onClick={() => onAddCard(idx + 1)} />
                  </React.Fragment>
                ))}
              </div>
            </SortableContext>
          );
        })()}
      </div>

      {/* ── Confirm modal ── */}
      {confirmAction && createPortal(
        <div className="home-confirm-overlay" onClick={() => setConfirmAction(null)}>
          <div className="home-confirm-modal" onClick={e => e.stopPropagation()}>
            <h3 className="home-confirm-title">
              {confirmAction === "ungroup" ? "Ta bort gruppering?" : "Ta bort samling?"}
            </h3>
            <p className="home-confirm-body">
              {confirmAction === "ungroup"
                ? "Detta tar bort alla objekt i samlingen. Objekten återgår till den klassiska staplade layouten."
                : "Alla objekt i samlingen flyttas till ditt arkiv."}
            </p>
            <div className="home-confirm-actions">
              <button type="button" className="home-confirm-btn home-confirm-btn--cancel" onClick={() => setConfirmAction(null)}>
                Avbryt
              </button>
              <button type="button" className="home-confirm-btn home-confirm-btn--confirm" onClick={() => {
                if (confirmAction === "ungroup") onUngroup?.();
                else onDeleteCategory?.();
                setConfirmAction(null);
              }}>
                {confirmAction === "ungroup" ? "Ta bort gruppering" : "Ta bort samling och arkivera objekt"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Card Divider (add-between) ────────────────────────────────────
function CardDivider({ onClick, variant }: { onClick: () => void; variant?: "category" }) {
  return (
    <div className={"home-card-divider" + (variant === "category" ? " home-card-divider--category" : "")}>
      <div className="home-card-divider-line" />
      <button type="button" className="home-card-divider-btn" onClick={onClick} aria-label="Lägg till kort här">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none">
          <path fill="#0075DE" d="M0 10C0 4.477 4.477 0 10 0s10 4.477 10 10-4.477 10-10 10S0 15.523 0 10Z"/>
          <path stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33" d="M10 5.333v9.334M5.333 10h9.334"/>
        </svg>
      </button>
      <div className="home-card-divider-line" />
    </div>
  );
}

function HomePageInner({ onNavigateToArchive }: { onNavigateToArchive: () => void }) {
  const { config, updateConfig, notifyDraftSaved } = usePreview();
  const { pushUndo } = usePublishBar();
  const [showModal, setShowModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [addToCategoryId, setAddToCategoryId] = useState<string | null>(null);
  const [addToCategoryIndex, setAddToCategoryIndex] = useState<number | undefined>(undefined);
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<PanelKey>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const dragOverCategoryIdRef = useRef<string | null>(null);
  const cardsBeforeDragRef = useRef<Card[] | null>(null);
  const pointerYRef = useRef<number | null>(null);
  const dropZoneCooldownCatRef = useRef<string | null>(null); // which category is on cooldown

  const cards: Card[] = (config?.home?.cards || []) as Card[];
  const sorted = [...cards].sort((a, b) => a.sortOrder - b.sortOrder);
  const childCardIds = new Set(
    cards.filter(c => c.type === "category").flatMap(c => (c as any).cardIds ?? [])
  );
  const rootSorted = sorted.filter(c => !childCardIds.has(c.id));
  const archivedCards: ArchivedCard[] = (config?.home?.archivedCards || []) as ArchivedCard[];

  const handlePanelToggle = useCallback((id: string, key: Exclude<PanelKey, null>) => {
    if (activeCard === id && activePanel === key) {
      setActivePanel(null);
      setActiveCard(null);
    } else {
      setActiveCard(id);
      setActivePanel(key);
    }
  }, [activeCard, activePanel]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // ── Helpers ──────────────────────────────────────────────────────
  const homeSnapshot = useCallback(() =>
    ({ home: { version: 1, links: config?.home?.links || [], cards, archivedCards } } as any),
  [config, cards, archivedCards]);

  /** Save cards with undo snapshot + optimistic update + debounced server persist. */
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DRAFT_DEBOUNCE_MS = 600;

  const saveHome = useCallback((newCards: Card[], newArchive?: ArchivedCard[]) => {
    pushUndo(homeSnapshot());
    const archive = newArchive ?? archivedCards;
    const payload = { home: { version: 1, links: config?.home?.links || [], cards: newCards, archivedCards: archive } } as any;

    // Instant optimistic update (local state only — no server call, no iframe refresh)
    updateConfig(payload);

    // Debounced server persist + iframe content refresh
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      startTransition(async () => {
        const result = await updateDraft(payload);
        console.log(`[saveHome] updateDraft result:`, result);
        notifyDraftSaved();
      });
    }, DRAFT_DEBOUNCE_MS);
  }, [config, archivedCards, updateConfig, notifyDraftSaved, pushUndo, homeSnapshot]);

  // Flush pending draft on unmount
  useEffect(() => () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); }, []);

  // Alias for drag-and-drop (no archive change)
  const save = saveHome;

  const getParentCategory = useCallback((cardId: string) =>
    cards.find(c => c.type === "category" && ((c as any).cardIds ?? []).includes(cardId)) as (Card & { cardIds: string[] }) | undefined,
  [cards]);

  // ── Root-level drag (toppnivå + drag-in/ut) ──────────────────────
  const activeDragIdRef = useRef<string | null>(null);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const dragId = event.active.id as string;
    setActiveDragId(dragId);
    activeDragIdRef.current = dragId;
    cardsBeforeDragRef.current = cards;
    dropZoneCooldownCatRef.current = null;

    // Continuous pointer tracking + drop-zone check via native event
    const onPointerMove = (e: PointerEvent) => {
      pointerYRef.current = e.clientY;
      const pointerY = e.clientY;
      const wasActive = dragOverCategoryIdRef.current;

      let newDropTarget: string | null = null;
      const dragCard = cards.find(c => c.id === dragId);
      const isChildOfCategory = cards.some(c => c.type === "category" && ((c as any).cardIds ?? []).includes(dragId));
      const canDropIntoCategory = !dragId.startsWith("cat_") && !isChildOfCategory && isCategoryFriendly((dragCard as any)?.cardType);
      if (canDropIntoCategory) {
        const allCatEls = document.querySelectorAll('[data-category-id]');
        allCatEls.forEach(el => {
          const id = el.getAttribute('data-category-id');
          if (id === dragId) return;
          const catRect = el.getBoundingClientRect();
          const catHeight = catRect.bottom - catRect.top;
          const baseInset = Math.max(10, Math.min(40, catHeight * 0.15));
          const inset = (wasActive === id) ? Math.min(baseInset, 10) : baseInset;

          if (pointerY >= catRect.top + inset && pointerY <= catRect.bottom - inset) {
            // Blocked: denna kategori är på cooldown (pekaren har inte lämnat den helt)
            if (dropZoneCooldownCatRef.current === id) return;
            newDropTarget = id;
          } else {
            // Pekaren är utanför denna kategori — rensa cooldown om det var denna
            if (dropZoneCooldownCatRef.current === id) {
              dropZoneCooldownCatRef.current = null;
            }
          }
        });
      }

      // Om drop-zone avaktiveras, lägg kategorin på cooldown
      // Den kan inte återaktiveras förrän pekaren helt lämnat dess bounds
      if (wasActive && !newDropTarget) {
        dropZoneCooldownCatRef.current = wasActive;
      }

      if (newDropTarget !== wasActive) {
        dragOverCategoryIdRef.current = newDropTarget;
        _activeCategoryDropZone = newDropTarget;
        setDomDropTarget(newDropTarget);
      }
    };

    pointerYRef.current = (event.activatorEvent as PointerEvent)?.clientY ?? null;
    window.addEventListener('pointermove', onPointerMove);
    const cleanup = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', cleanup);
    };
    window.addEventListener('pointerup', cleanup);
  }, [cards]);

  const setDomDropTarget = useCallback((id: string | null) => {
    document.querySelectorAll('.home-category-card--drop-target').forEach(el => {
      el.classList.remove('home-category-card--drop-target');
    });
    if (id) {
      const el = document.querySelector(`[data-category-id="${id}"]`);
      el?.classList.add('home-category-card--drop-target');
    }
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const activeId = event.active.id as string;

    // Drop-zone hanteras av pointermove-listenern i handleDragStart.
    // Här hanterar vi bara cross-container ejection.
    if (dragOverCategoryIdRef.current) return; // drop-zone aktiv → vänta

    const activeParent = getParentCategory(activeId);
    if (!activeParent) return; // redan root-nivå

    const overId = event.over?.id as string | undefined;
    if (!overId) return;
    const overCard = cards.find(c => c.id === overId);
    const overParent = getParentCategory(overId);
    if (overParent || overCard?.type === "category") return;

    // Ejekta: ta bort från föräldra-kategori
    const newCardIds = activeParent.cardIds.filter((id: string) => id !== activeId);
    let updated = cards.map(c =>
      c.id === activeParent.id ? { ...c, cardIds: newCardIds } as Card : c
    );

    // Beräkna root-sortOrder med ejekterat kort nära over-kortet
    const childIds = new Set(
      updated.filter(c => c.type === "category").flatMap(c => (c as any).cardIds ?? [])
    );
    const rootCards = updated.filter(c => !childIds.has(c.id)).sort((a, b) => a.sortOrder - b.sortOrder);
    const overIdx = rootCards.findIndex(c => c.id === overId);
    const withoutActive = rootCards.filter(c => c.id !== activeId);
    const insertAt = overIdx >= 0 ? overIdx : withoutActive.length;
    const reinserted = [
      ...withoutActive.slice(0, insertAt),
      updated.find(c => c.id === activeId)!,
      ...withoutActive.slice(insertAt),
    ];
    updated = updated.map(c => {
      const idx = reinserted.findIndex(r => r.id === c.id);
      return idx >= 0 ? { ...c, sortOrder: idx } : c;
    });

    updateConfig({ home: { version: 1, links: config?.home?.links || [], cards: updated, archivedCards } } as any);
  }, [cards, config, archivedCards, updateConfig, getParentCategory, setDomDropTarget]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const activeId = event.active.id as string;

    // Använd den aktiva drop-zone från handleDragOver (redan validerad med hysteresis)
    let dropIntoCategoryId = dragOverCategoryIdRef.current;

    // Fallback: kolla pekarposition vid release
    const activeCard = cards.find(c => c.id === activeId);
    if (!dropIntoCategoryId && !activeId.startsWith("cat_") && isCategoryFriendly((activeCard as any)?.cardType)) {
      const pointerY = pointerYRef.current;
      if (pointerY !== null) {
        const allCatEls = document.querySelectorAll('[data-category-id]');
        allCatEls.forEach(el => {
          const id = el.getAttribute('data-category-id');
          if (id === activeId) return;
          const catRect = el.getBoundingClientRect();
          const catHeight = catRect.bottom - catRect.top;
          const inset = Math.max(10, Math.min(40, catHeight * 0.15));
          if (pointerY >= catRect.top + inset && pointerY <= catRect.bottom - inset) {
            dropIntoCategoryId = id;
          }
        });
      }
    }

    setActiveDragId(null);
    activeDragIdRef.current = null;
    setDomDropTarget(null);
    dragOverCategoryIdRef.current = null;
    _activeCategoryDropZone = null;
    pointerYRef.current = null;
    dropZoneCooldownCatRef.current = null;
    const wasEjected = cardsBeforeDragRef.current !== null &&
      cardsBeforeDragRef.current !== cards;
    cardsBeforeDragRef.current = null;

    const { over } = event;
    const parent = getParentCategory(activeId);

    // CASE A: Löst kort → in i kategori (50%+ fysisk överlapp)
    if (!parent && dropIntoCategoryId && dropIntoCategoryId !== activeId && isCategoryFriendly((activeCard as any)?.cardType)) {
      const updated = cards.map(c =>
        c.id === dropIntoCategoryId
          ? { ...c, cardIds: [...((c as any).cardIds ?? []), activeId] } as Card
          : c
      );
      save(updated);
      return;
    }

    if (!over) {
      // Om kortet ejekterades under drag, spara nuvarande state
      if (wasEjected) save(cards);
      return;
    }
    let overId = over.id as string;
    if (activeId === overId) {
      if (wasEjected) save(cards);
      return;
    }

    // CASE B: Barn-kort — omsortera inom kategori eller dra ut
    if (parent) {
      const overParent = getParentCategory(overId);
      const sameCategory = overParent?.id === parent.id;
      if (sameCategory) {
        // Omsortera inom samma kategori
        const cardIds: string[] = (parent as any).cardIds ?? [];
        const oldIdx = cardIds.indexOf(activeId);
        const newIdx = cardIds.indexOf(overId);
        if (oldIdx === -1 || newIdx === -1) return;
        const reorderedIds = arrayMove(cardIds, oldIdx, newIdx);
        const updated = cards.map(c =>
          c.id === parent.id ? { ...c, cardIds: reorderedIds } as Card : c
        );
        save(updated);
        return;
      } else {
        const newCardIds = parent.cardIds.filter((id: string) => id !== activeId);
        const step1 = cards.map(c =>
          c.id === parent.id ? { ...c, cardIds: newCardIds } as Card : c
        );
        const rootCards = step1.filter(c => !getParentCategory(c.id) || c.id === activeId);
        const activeCardObj = cards.find(c => c.id === activeId)!;
        const overRootIdx = rootCards.findIndex(c => c.id === overId);
        const withoutActive = rootCards.filter(c => c.id !== activeId);
        const insertAt = overRootIdx >= 0 ? overRootIdx : withoutActive.length;
        const reinserted = [...withoutActive.slice(0, insertAt), activeCardObj, ...withoutActive.slice(insertAt)];
        const childIds = new Set(
          step1.filter(c => c.type === "category").flatMap(c => (c as any).cardIds ?? [])
        );
        childIds.delete(activeId);
        const finalCards = step1.map(c => {
          if (childIds.has(c.id)) return c;
          const idx = reinserted.findIndex(r => r.id === c.id);
          return idx >= 0 ? { ...c, sortOrder: idx } : c;
        });
        const activeInRoot = reinserted.findIndex(r => r.id === activeId);
        const merged = finalCards.map(c => c.id === activeId ? { ...c, sortOrder: activeInRoot } : c);
        save(merged);
        return;
      }
    }

    // CASE C: Toppnivå-omsortering (kategori-kort och vanliga kort identiskt)
    const rootSorted = sorted.filter(c => !getParentCategory(c.id));
    const oldIndex = rootSorted.findIndex(c => c.id === activeId);
    const newIndex = rootSorted.findIndex(c => c.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(rootSorted, oldIndex, newIndex);
    const childIds = new Set(
      cards.filter(c => c.type === "category").flatMap(c => (c as any).cardIds ?? [])
    );
    let rootIdx = 0;
    const updated = sorted.map(c => {
      if (childIds.has(c.id)) return c;
      const newOrder = reordered.findIndex(r => r.id === c.id);
      return { ...c, sortOrder: newOrder >= 0 ? newOrder : rootIdx++ };
    });
    save(updated);
  }, [sorted, cards, getParentCategory, save]);

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
    activeDragIdRef.current = null;
    setDomDropTarget(null);
    dragOverCategoryIdRef.current = null;
    _activeCategoryDropZone = null;
    pointerYRef.current = null;
    dropZoneCooldownCatRef.current = null;
    if (cardsBeforeDragRef.current) {
      updateConfig({ home: { version: 1, links: config?.home?.links || [], cards: cardsBeforeDragRef.current, archivedCards } } as any);
      cardsBeforeDragRef.current = null;
    }
  }, [config, archivedCards, updateConfig, setDomDropTarget]);

  const handleAdd = useCallback((newCard: Card) => {
    let updated: Card[];
    if (insertAtIndex !== null) {
      const newRoot = [...rootSorted];
      newRoot.splice(insertAtIndex, 0, newCard);
      const orderMap = new Map(newRoot.map((c, i) => [c.id, i]));
      updated = [
        ...cards.map(c => {
          const order = orderMap.get(c.id);
          return order !== undefined ? { ...c, sortOrder: order } : c;
        }),
        { ...newCard, sortOrder: orderMap.get(newCard.id)! },
      ];
    } else {
      // Insert at top: new card gets sortOrder 0, shift all root cards down
      const shifted = cards.map(c => ({ ...c, sortOrder: c.sortOrder + 1 }));
      updated = [{ ...newCard, sortOrder: 0 }, ...shifted];
    }
    saveHome(updated);
    setShowModal(false);
    setInsertAtIndex(null);

    // Auto-open the first panel if the card type requests it
    const ctConfig = getCardTypeConfig((newCard as any).cardType);
    if (ctConfig.autoOpenPanel) {
      setActiveCard(newCard.id);
      setActivePanel(ctConfig.autoOpenPanel as Exclude<PanelKey, null>);
    }
  }, [cards, rootSorted, insertAtIndex, saveHome]);

  const handleAddToCategory = useCallback((categoryId: string, newCard: Card, atIndex?: number) => {
    const updatedCards = [...cards, newCard];
    const updatedWithCategory = updatedCards.map(c => {
      if (c.id !== categoryId) return c;
      const ids = [...((c as any).cardIds ?? [])];
      if (atIndex !== undefined && atIndex >= 0 && atIndex <= ids.length) {
        ids.splice(atIndex, 0, newCard.id);
      } else {
        ids.push(newCard.id);
      }
      return { ...c, cardIds: ids } as Card;
    });
    saveHome(updatedWithCategory);
  }, [cards, saveHome]);

  const handleToggle = useCallback((id: string) => {
    const target = cards.find(c => c.id === id);
    if (!target) return;
    const newActive = !target.isActive;
    if (target.type === "category") {
      const childIds = new Set((target as any).cardIds || []);
      const updated = cards.map(c =>
        c.id === id || childIds.has(c.id) ? { ...c, isActive: newActive } : c
      );
      saveHome(updated);
    } else {
      const updated = cards.map(c => c.id === id ? { ...c, isActive: newActive } : c);
      saveHome(updated);
    }
  }, [cards, saveHome]);

  const handleDelete = useCallback((id: string) => {
    const updatedCards = cards
      .filter(c => c.id !== id)
      .map(c => c.type === "category" && (c as any).cardIds
        ? { ...c, cardIds: (c as any).cardIds.filter((cid: string) => cid !== id) }
        : c);
    saveHome(updatedCards);
  }, [cards, saveHome]);

  const handleUngroup = useCallback((categoryId: string) => {
    const cat = cards.find(c => c.id === categoryId);
    if (!cat) return;
    const childIds: string[] = (cat as any).cardIds ?? [];
    // Remove the category card, keep child cards as loose root cards
    const catSortOrder = cat.sortOrder;
    const updatedCards = cards
      .filter(c => c.id !== categoryId)
      .map((c, _i) => {
        const childIdx = childIds.indexOf(c.id);
        if (childIdx >= 0) {
          // Place child cards at the category's old sort position
          return { ...c, sortOrder: catSortOrder + childIdx * 0.01 };
        }
        return c;
      });
    // Normalize sort orders
    const sorted = [...updatedCards].sort((a, b) => a.sortOrder - b.sortOrder);
    const normalized = sorted.map((c, i) => ({ ...c, sortOrder: i }));
    save(normalized);
  }, [cards, save]);

  const handleDeleteCategory = useCallback((categoryId: string) => {
    const cat = cards.find(c => c.id === categoryId);
    if (!cat) return;
    const childIds: string[] = (cat as any).cardIds ?? [];
    const childCards = childIds.map(id => cards.find(c => c.id === id)).filter((c): c is Card => !!c);
    const newArchived = childCards.map(c => ({ ...c, archivedAt: new Date().toISOString(), archivedReason: "manual" }) as ArchivedCard);
    const updatedCards = cards.filter(c => c.id !== categoryId && !childIds.includes(c.id));
    const updatedArchive = [...archivedCards, ...newArchived];
    saveHome(updatedCards, updatedArchive);
  }, [cards, archivedCards, saveHome]);

  const handleArchive = useCallback((id: string) => {
    const card = cards.find(c => c.id === id);
    if (!card) return;
    const archivedCard: ArchivedCard = { ...card, archivedAt: new Date().toISOString(), archivedReason: "manual" };
    const updatedCards = cards
      .filter(c => c.id !== id)
      .map(c => c.type === "category" && (c as any).cardIds
        ? { ...c, cardIds: (c as any).cardIds.filter((cid: string) => cid !== id) }
        : c);
    const updatedArchive = [...archivedCards, archivedCard];
    saveHome(updatedCards, updatedArchive);
  }, [cards, archivedCards, saveHome]);

  const handleRestore = useCallback((archived: ArchivedCard) => {
    const { archivedAt: _at, archivedBy: _by, archivedReason: _r, ...cardData } = archived as any;
    const restoredCard: Card = { ...cardData, isActive: false, sortOrder: cards.length };
    const updatedCards = [...cards, restoredCard];
    const updatedArchive = archivedCards.filter(c => c.id !== archived.id);
    saveHome(updatedCards, updatedArchive);
  }, [cards, archivedCards, saveHome]);

  const handlePermanentDelete = useCallback((id: string) => {
    const updatedArchive = archivedCards.filter(c => c.id !== id);
    saveHome(cards, updatedArchive);
  }, [cards, archivedCards, saveHome]);

  const handleUpdate = useCallback((updated: Card) => {
    const newCards = cards.map(c => c.id === updated.id ? updated : c);
    saveHome(newCards);
  }, [cards, saveHome]);

  const handleAddCategory = useCallback(() => {
    const newCategory: Card = {
      id: `cat_${Date.now()}`,
      type: "category",
      title: "",
      description: "",
      sortOrder: 0,
      isActive: true,
      layout: "stack",
      cardIds: [],
    } as any;
    const shifted = cards.map(c => ({ ...c, sortOrder: c.sortOrder + 1 }));
    const updatedCards = [newCategory, ...shifted];
    saveHome(updatedCards);
  }, [cards, saveHome]);

  const activeDragCard = sorted.find(c => c.id === activeDragId) ?? null;

  return (
    <div className="home-content">
      <div className="home-section-header">
        <div>
          <div className="home-section-title">Kort</div>
          <div className="home-section-sub">{sorted.filter(c => c.isActive).length} aktiva</div>
        </div>
      </div>
      <button type="button" className="home-add-btn-full" onClick={() => setShowModal(true)}>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
          <rect width="256" height="256" fill="none"/>
          <line x1="40" y1="128" x2="216" y2="128" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16"/>
          <line x1="128" y1="40" x2="128" y2="216" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16"/>
        </svg>
        Lägg till
      </button>
      <div className="home-secondary-row">
        <button type="button" className="home-secondary-btn" onClick={handleAddCategory}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" clipRule="evenodd" d="M0.5 -0.000244141H0V0.999755L0.5 0.999756L15.4999 0.999775L15.9999 0.999776L15.9999 -0.000224382L15.4999 -0.000225008L0.5 -0.000244141ZM0.500074 3.99976L7.37309e-05 4.49975L0 15.4998L0.5 15.9998H15.5L16 15.4998V4.49977L15.5 3.99977L0.500074 3.99976ZM1 14.9998L1.00007 4.99976L15 4.99977V14.9998H1Z" fill="currentColor"/>
          </svg>
          Lägg till samling
        </button>
        <button type="button" className="home-secondary-btn home-secondary-btn--plain" onClick={onNavigateToArchive}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path stroke="currentColor" d="M1.65 4.25v10.67h12.7c-.02-3.55 0-7.11 0-10.67M15.5 1.08H.5v2.88h15V1.08ZM5 6.5h6"/>
          </svg>
          Visa arkiv
          <ChevronIcon className="sched-chevron--right" />
        </button>
      </div>
      <DndContext
        id="root-dnd"
        sensors={sensors}
        collisionDetection={categoryAwareCollision}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={rootSorted.map(c => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="home-card-list">
            {rootSorted.length === 0 ? (
              <div className="home-empty">Inga kort ännu. Lägg till ett för att komma igång.</div>
            ) : (
              rootSorted.map((card, index) => (
                <React.Fragment key={card.id}>
                  {index === 0 && !activeDragId && (
                    <CardDivider onClick={() => { setInsertAtIndex(0); setShowModal(true); }} />
                  )}
                  {card.type === "category" ? (
                    <SortableCategoryCardItem
                      card={card}
                      onToggle={handleToggle}
                      onUpdate={handleUpdate}
                      onAddCard={(atIndex) => { setAddToCategoryId(card.id); setAddToCategoryIndex(atIndex); }}
                      allCards={cards}
                      onDelete={handleDelete}
                      onArchive={handleArchive}
                      onUngroup={() => handleUngroup(card.id)}
                      onDeleteCategory={() => handleDeleteCategory(card.id)}
                    />
                  ) : (
                    <SortableCardItem
                      card={card}
                      openPanel={activeCard === card.id ? activePanel : null}
                      onPanelToggle={handlePanelToggle}
                      onToggle={() => handleToggle(card.id)}
                      onDelete={() => handleDelete(card.id)}
                      onArchive={() => handleArchive(card.id)}
                      onUpdate={handleUpdate}
                    />
                  )}
                  {!activeDragId && (
                    <CardDivider onClick={() => { setInsertAtIndex(index + 1); setShowModal(true); }} />
                  )}
                </React.Fragment>
              ))
            )}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeDragCard ? (
            <div style={{ opacity: 1, borderRadius: 16 }}>
              {activeDragCard.type === "category" ? (
                <CategoryCardItem
                  card={activeDragCard}
                  collapsed
                  onToggle={() => {}}
                  onUpdate={() => {}}
                  onAddCard={() => {}}
                  allCards={[]}
                />
              ) : (
                <CardItem
                  card={activeDragCard}
                  openPanel={null}
                  onPanelToggle={() => {}}
                  onToggle={() => {}}
                  onDelete={() => {}}
                  onArchive={() => {}}
                  onUpdate={() => {}}
                />
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

            {showModal && createPortal(
        <AddCardModal existingCount={cards.length} onAdd={handleAdd} onClose={() => { setShowModal(false); setInsertAtIndex(null); }} />,
        document.body
      )}
      {addToCategoryId && createPortal(
        <AddCardModal
          existingCount={cards.length}
          onAdd={(newCard) => { handleAddToCategory(addToCategoryId, newCard, addToCategoryIndex); setAddToCategoryId(null); setAddToCategoryIndex(undefined); }}
          onClose={() => { setAddToCategoryId(null); setAddToCategoryIndex(undefined); }}
        />,
        document.body
      )}
    </div>
  );
}

function AddCardModal({ existingCount, onAdd, onClose }: { existingCount: number; onAdd: (card: Card) => void; onClose: () => void }) {
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setHasMounted(true), 400); return () => clearTimeout(t); }, []);

  const handlePick = useCallback((config: import("@/app/_lib/cardTypes/registry").CardTypeConfig) => {
    onAdd(config.createEmpty(existingCount));
  }, [existingCount, onAdd]);

  return (
    <>
      <div onClick={onClose} className="modal-backdrop" />
      <div className="modal-container">
        <div className="modal-header">
          <span className="modal-title">Lägg till kort</span>
          <button type="button" onClick={onClose} className="modal-close-btn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-view modal-view-enter-right">
            <div style={{ display: "grid", gap: 8 }}>
              {CARD_TYPE_LIST.map((ct) => (
                <button key={ct.key} type="button" onClick={() => handlePick(ct)}
                  className="modal-type-row">
                  <div className="modal-type-icon" style={{ color: ct.iconColor, background: ct.iconBg }}>{ct.icon}</div>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#2D2C2B" }}>{ct.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 400, color: "#666", marginTop: 2 }}>{ct.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
