"use client";
import { useCallback, useState, useTransition, useRef, useEffect, useLayoutEffect } from "react";
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
import { updateDraft } from "../_lib/tenant/updateDraft";
import { ImageUpload } from "../_components/ImageUpload";
import { useUpload } from "../_hooks/useUpload";


function ArchivePageInner() {
  const { config, updateConfig } = usePreview();
  const [isPending, startTransition] = useTransition();
  const cards: Card[] = (config?.home?.cards || []) as Card[];
  const archivedCards: ArchivedCard[] = (config?.home?.archivedCards || []) as ArchivedCard[];

  const handlePermanentDelete = useCallback((id: string) => {
    const updatedArchive = archivedCards.filter(c => c.id !== id);
    updateConfig({ home: { version: 1, links: config?.home?.links || [], cards, archivedCards: updatedArchive } } as any);
    startTransition(async () => { await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards, archivedCards: updatedArchive } } as any); });
  }, [cards, archivedCards, config, updateConfig]);

  const handleRestore = useCallback((archived: ArchivedCard) => {
    const { archivedAt: _at, archivedBy: _by, archivedReason: _r, ...cardData } = archived as any;
    const restoredCard: Card = { ...cardData, isActive: false, sortOrder: cards.length };
    const updatedCards = [...cards, restoredCard];
    const updatedArchive = archivedCards.filter(c => c.id !== archived.id);
    updateConfig({ home: { version: 1, links: config?.home?.links || [], cards: updatedCards, archivedCards: updatedArchive } } as any);
    startTransition(async () => { await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: updatedCards, archivedCards: updatedArchive } } as any); });
  }, [cards, archivedCards, config, updateConfig]);

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
      {isPending && <div className="home-saving">Sparar...</div>}
    </div>
  );
}

export default function HomeClient({ initialConfig }: { initialConfig: TenantConfig }) {
  const [view, setView] = useState<"home" | "archive">("home");
  return (
    <PreviewProvider initialConfig={initialConfig}>
      <div className="admin-page">
        <div className="admin-editor">
          <div className="admin-header">
            {view === "archive" && <BackButton onClick={() => setView("home")} />}
            <h1 className="admin-title">{view === "archive" ? "Arkiv" : "Startsida"}</h1>
          </div>
          <div className="admin-content">
            {view === "home" ? <HomePageInner onNavigateToArchive={() => setView("archive")} /> : <ArchivePageInner />}
          </div>
        </div>
        <div className="admin-preview">
          <GuestPreviewFrame route="/p/[token]" className="preview-widget-sticky" />
        </div>
      </div>
    </PreviewProvider>
  );
}

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
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 256 256">
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

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={onChange}
      className={"home-toggle" + (checked ? " home-toggle-on" : "")}>
      <span className="home-toggle-thumb" />
    </button>
  );
}

type PanelKey = "layout" | "image" | "badge" | "schedule" | "delete" | null;
const PANEL_LABELS: Record<Exclude<PanelKey, null>, string> = {
  layout: "Layout", image: "Bild", badge: "Badge", schedule: "Schema", delete: "Ta bort",
};
type LayoutStyle = "classic" | "featured" | "showcase";

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

function LayoutPanelContent({ card, onChange }: { card: Card; onChange: (layout: LayoutStyle) => void }) {
  const current: LayoutStyle = (card as any).layoutStyle ?? "classic";
  const hasImage = !!(card as any).image;
  return (
    <div className="card-panel-body">
      <p className="card-panel-desc">Choose a layout for your link</p>
      <div className="card-panel-options">
        <button type="button"
          className={"card-layout-option" + (current === "classic" ? " card-layout-option--active" : "")}
          onClick={() => onChange("classic")}>
          <div className="card-layout-option-left">
            <div className={"card-layout-radio" + (current === "classic" ? " card-layout-radio--checked" : "")}>
              {current === "classic" && <div className="card-layout-radio-dot" />}
            </div>
            <div>
              <div className="card-layout-option-title">Classic</div>
              <div className="card-layout-option-sub">Efficient, direct and compact.</div>
            </div>
          </div>
          <div className="card-layout-preview card-layout-preview--classic" />
        </button>
        <button type="button"
          className={"card-layout-option card-layout-option--featured" + (current === "featured" ? " card-layout-option--active" : "")}
          onClick={() => onChange("featured")}>
          <div className="card-layout-option-left">
            <div className={"card-layout-radio" + (current === "featured" ? " card-layout-radio--checked" : "")}>
              {current === "featured" && <div className="card-layout-radio-dot" />}
            </div>
            <div className="card-layout-featured-text">
              <div className="card-layout-option-title">Featured</div>
              <div className="card-layout-option-sub">Make your link stand out with a larger, more attractive display.</div>
              <FeaturedUploadButton />
            </div>
          </div>
          <div className="card-layout-preview card-layout-preview--featured" />
        </button>
        <button type="button"
          className={"card-layout-option" + (current === "showcase" ? " card-layout-option--active" : "")}
          onClick={() => onChange("showcase")}>
          <div className="card-layout-option-left">
            <div className={"card-layout-radio" + (current === "showcase" ? " card-layout-radio--checked" : "")}>
              {current === "showcase" && <div className="card-layout-radio-dot" />}
            </div>
            <div>
              <div className="card-layout-option-title">Showcase</div>
              <div className="card-layout-option-sub">Full image with title beneath — clean, editorial look.</div>
            </div>
          </div>
          <div className="card-layout-preview card-layout-preview--showcase" />
        </button>
      </div>
    </div>
  );
}

function ImagePanelContent({ card, onUpdate }: { card: Card; onUpdate: (updated: Card) => void }) {
  return (
    <div className="card-panel-body">
      <p className="card-panel-desc">Omslagsbild som visas på kortet för gästerna.</p>
      <ImageUpload
        value={(card as any).image}
        folder="cards"
        shape="wide"
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
            onClick={() => onChange(badge === p ? "" : p)}>{p}</button>
        ))}
      </div>
    </div>
  );
}

const MONTHS_SV = ["Januari","Februari","Mars","April","Maj","Juni","Juli","Augusti","September","Oktober","November","December"];
const DAYS_SV = ["Sön","Mån","Tis","Ons","Tor","Fre","Lör"];

function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDayOfMonth(year: number, month: number) { return new Date(year, month, 1).getDay(); }

type ScheduleDate = { year: number; month: number; day: number; hour: number; minute: number; ampm: "AM" | "PM" } | null;

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
  const [ampm, setAmpm] = useState<"AM"|"PM">(value?.ampm ?? "AM");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const style: React.CSSProperties = anchorRect ? {
    position: "fixed", top: anchorRect.bottom + 6, left: anchorRect.left, zIndex: 9999,
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
    onSelect({ year: viewYear, month: viewMonth, day, hour, minute, ampm });
    onClose();
  };

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };
  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() + i);

  return (
    <div className="sched-popup" ref={ref} style={style}>
      <div className="sched-popup-header">
        <button type="button" className="sched-nav-btn" onClick={prevMonth}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div className="sched-popup-title">
          <button type="button" className="sched-month-btn" onClick={() => { setShowMonthPicker(p => !p); setShowYearPicker(false); }}>
            {MONTHS_SV[viewMonth]}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <button type="button" className="sched-month-btn" onClick={() => { setShowYearPicker(p => !p); setShowMonthPicker(false); }}>
            {viewYear}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </div>
        <button type="button" className="sched-nav-btn" onClick={nextMonth}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
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
        <select className="sched-time-select" value={hour} onChange={e => setHour(Number(e.target.value))}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={h}>{String(h).padStart(2,"0")}</option>)}
        </select>
        <select className="sched-time-select" value={minute} onChange={e => setMinute(Number(e.target.value))}>
          {[0,15,30,45].map(m => <option key={m} value={m}>{String(m).padStart(2,"0")}</option>)}
        </select>
        <select className="sched-time-select" value={ampm} onChange={e => setAmpm(e.target.value as "AM"|"PM")}>
          <option value="AM">FM</option>
          <option value="PM">EM</option>
        </select>
      </div>
    </div>
  );
}

function formatScheduleDate(d: ScheduleDate): string {
  if (!d) return "";
  return `${d.day} ${MONTHS_SV[d.month].slice(0,3)} ${d.year}, ${String(d.hour).padStart(2,"0")}:${String(d.minute).padStart(2,"0")} ${d.ampm === "AM" ? "FM" : "EM"}`;
}

function SchedulePanelContent() {
  const [showFrom, setShowFrom] = useState<ScheduleDate>(null);
  const [hideFrom, setHideFrom] = useState<ScheduleDate>(null);
  const [openPicker, setOpenPicker] = useState<"show"|"hide"|null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const showRef = useRef<HTMLButtonElement>(null);
  const hideRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (openPicker === "show" && showRef.current) setAnchorRect(showRef.current.getBoundingClientRect());
    if (openPicker === "hide" && hideRef.current) setAnchorRect(hideRef.current.getBoundingClientRect());
  }, [openPicker]);

  const hasDate = !!(showFrom || hideFrom);
  return (
    <div className="card-panel-body">
      <p className="card-panel-desc">Välj datum för att visa eller dölja kortet för gäster.</p>
      <div className="sched-row">
        <div className="sched-picker-wrap">
          <button type="button"
            className={"sched-trigger" + (openPicker === "show" ? " sched-trigger--open" : "") + (showFrom ? " sched-trigger--set" : "")}
            ref={showRef} onClick={() => setOpenPicker(p => p === "show" ? null : "show")}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16" width="15" height="15">
              <g><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M3.5.5v2M10.5.5v2M11.5 9.5v2h2"/>
              <circle cx="11.5" cy="11.5" r="4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
              <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M13.5 5.85V2.5a1 1 0 00-1-1h-11a1 1 0 00-1 1v10a1 1 0 001 1h4.351"/></g>
            </svg>
            <span>{showFrom ? formatScheduleDate(showFrom) : "Visa från"}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
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
            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16" width="15" height="15">
              <g><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M3.5.5v2M10.5.5v2M11.5 9.5v2h2"/>
              <circle cx="11.5" cy="11.5" r="4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/>
              <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M13.5 5.85V2.5a1 1 0 00-1-1h-11a1 1 0 00-1 1v10a1 1 0 001 1h4.351"/></g>
            </svg>
            <span>{hideFrom ? formatScheduleDate(hideFrom) : "Dölj från"}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {openPicker === "hide" && typeof window !== "undefined" && createPortal(
            <CalendarPopup value={hideFrom} min={showFrom ?? undefined} anchorRect={anchorRect} onSelect={d => { setHideFrom(d); setOpenPicker(null); }} onClose={() => setOpenPicker(null)} />,
            document.body
          )}
        </div>
      </div>
      <button type="button" className={"sched-save-btn" + (hasDate ? " sched-save-btn--active" : "")} disabled={!hasDate}>
        Schemalägg
      </button>
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

// ── Confirm Dialog ────────────────────────────────────────────────
function ConfirmDialog({ title, description, confirmLabel = "Bekräfta", danger = false, onConfirm, onCancel }: {
  title: string; description: string; confirmLabel?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return createPortal(
    <>
      <div className="confirm-backdrop" onClick={onCancel} />
      <div className="confirm-dialog">
        <div className="confirm-icon">{danger ? "🗑️" : "⚠️"}</div>
        <div className="confirm-title">{title}</div>
        <div className="confirm-desc">{description}</div>
        <div className="confirm-actions">
          <button type="button" className="confirm-btn confirm-btn--cancel" onClick={onCancel}>Avbryt</button>
          <button type="button" className={"confirm-btn" + (danger ? " confirm-btn--danger" : " confirm-btn--primary")} onClick={onConfirm}>
            {confirmLabel}
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
  const sub = (card as any).url || (card as any).fileUrl || card.type;
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
          {openPanel === "delete" && <DeletePanelContent onDelete={onDelete} onArchive={() => setOpenPanel(null)} />}
          {openPanel === "restore" && <RestorePanelContent onRestore={onRestore} onCancel={() => setOpenPanel(null)} />}
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
  const [titleVal, setTitleVal] = useState(card.title);
  const [urlVal, setUrlVal] = useState((card as any).url ?? (card as any).fileUrl ?? "");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const sub = (card as any).url || (card as any).fileUrl || card.type;

  const handleTitleBlur = () => {
    setEditingTitle(false);
    if (titleVal.trim() && titleVal.trim() !== card.title)
      onUpdate({ ...card, title: titleVal.trim() });
    else setTitleVal(card.title);
  };

  const handleUrlBlur = () => {
    setEditingUrl(false);
    const key = card.type === "download" ? "fileUrl" : "url";
    if (urlVal.trim() !== ((card as any)[key] ?? ""))
      onUpdate({ ...card, [key]: urlVal.trim() } as Card);
  };

  const panelContent =
    openPanel === "layout"   ? <LayoutPanelContent card={card} onChange={l => onUpdate({ ...card, layoutStyle: l } as any)} /> :
    openPanel === "image"    ? <ImagePanelContent card={card} onUpdate={onUpdate} /> :
    openPanel === "badge"    ? <BadgePanelContent card={card} onChange={b => onUpdate({ ...card, badge: b || undefined })} /> :
    openPanel === "schedule" ? <SchedulePanelContent /> :
    openPanel === "delete"   ? <DeletePanelContent onDelete={onDelete} onArchive={onArchive} /> : null;

  const iconDefs: { key: Exclude<PanelKey, null>; icon: React.ReactNode }[] = [
    { key: "layout",   icon: <LayoutIcon /> },
    { key: "image",    icon: <ImageIcon /> },
    { key: "badge",    icon: <StarIcon /> },
    { key: "schedule", icon: <CalendarIcon /> },
  ];

  return (
    <div className={"home-card" + (openPanel ? " home-card--expanded" : "")}>
      <div className="home-card-top">
        <div className="home-card-drag" {...(dragHandleProps ?? {})} title="Dra för att sortera">
          <DragIcon />
        </div>
        <div className="home-card-body">
          <div className="home-card-row1">
            {editingTitle ? (
              <input ref={titleInputRef} className="home-card-inline-input home-card-inline-input--title"
                value={titleVal} onChange={e => setTitleVal(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={e => { if (e.key === "Enter") titleInputRef.current?.blur(); if (e.key === "Escape") { setTitleVal(card.title); setEditingTitle(false); } }} />
            ) : (
              <span className="home-card-title">{card.title}</span>
            )}
            {(card as any).badge && !editingTitle && <span className="home-card-badge">{(card as any).badge}</span>}
            <button type="button" className="home-card-icon-btn" aria-label="Redigera titel"
              onClick={() => { setEditingTitle(true); setTimeout(() => titleInputRef.current?.focus(), 0); }}>
              <PenIcon />
            </button>
          </div>
          <div className="home-card-row2">
            {editingUrl ? (
              <input ref={urlInputRef} className="home-card-inline-input home-card-inline-input--url"
                value={urlVal} onChange={e => setUrlVal(e.target.value)}
                onBlur={handleUrlBlur}
                onKeyDown={e => { if (e.key === "Enter") urlInputRef.current?.blur(); if (e.key === "Escape") setEditingUrl(false); }} />
            ) : (
              <span className="home-card-sub">{sub}</span>
            )}
            <button type="button" className="home-card-icon-btn" aria-label="Redigera URL"
              onClick={() => { setEditingUrl(true); setUrlVal((card as any).url ?? (card as any).fileUrl ?? ""); setTimeout(() => urlInputRef.current?.focus(), 0); }}>
              <PenIcon />
            </button>
          </div>
          <div className="home-card-row3">
            <div className="home-card-icons">
              {iconDefs.map(({ key, icon }) => (
                <button key={key} type="button"
                  className={"home-card-icon-btn" + (openPanel === key ? " home-card-icon-btn--active" : "")}
                  title={PANEL_LABELS[key]} onClick={() => onPanelToggle(card.id, key)}>
                  {icon}
                </button>
              ))}
            </div>
            <button type="button" className={"home-card-icon-btn home-card-trash" + (openPanel === "delete" ? " home-card-icon-btn--active home-card-icon-btn--active-danger" : "")} onClick={() => onPanelToggle(card.id, "delete")} aria-label="Ta bort">
              <TrashIcon />
            </button>
          </div>
        </div>
        <div className="home-card-toggle">
          <Toggle checked={card.isActive} onChange={onToggle} />
        </div>
      </div>
      <div className={"home-card-panel" + (openPanel ? " home-card-panel--open" : "")}>
        <div className="home-card-panel-inner">
          <div className="home-card-panel-header">
            <div style={{ width: 26, flexShrink: 0 }} />
            <span className="home-card-panel-label">{openPanel ? PANEL_LABELS[openPanel] : ""}</span>
            <button type="button" className="home-card-panel-close"
              onClick={() => { if (openPanel) onPanelToggle(card.id, openPanel as Exclude<PanelKey, null>); }}>
              <CloseIcon />
            </button>
          </div>
          {panelContent}
        </div>
      </div>
    </div>
  );
}

function SortableCategoryCardItem({ card, onToggle, onUpdate, onAddCard, allCards }: {
  card: Card;
  onToggle: () => void;
  onUpdate: (updated: Card) => void;
  onAddCard: () => void;
  allCards: Card[];
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
      <CategoryCardItem
        card={card}
        onToggle={onToggle}
        onUpdate={onUpdate}
        onAddCard={onAddCard}
        allCards={allCards}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function CategoryCardItem({ card, onToggle, onUpdate, onAddCard, allCards, dragHandleProps }: {
  card: Card;
  onToggle: () => void;
  onUpdate: (updated: Card) => void;
  onAddCard: () => void;
  allCards?: Card[];
  dragHandleProps?: Record<string, unknown>;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState((card as any).title ?? "");
  const [layoutOpen, setLayoutOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const currentLayout = (card as any).layout ?? "stack";
  const currentLayoutDef = CATEGORY_LAYOUTS.find(l => l.key === currentLayout) ?? CATEGORY_LAYOUTS[0];

  const handleTitleBlur = () => {
    setEditingTitle(false);
    if (titleVal.trim() && titleVal.trim() !== card.title)
      onUpdate({ ...card, title: titleVal.trim() } as Card);
    else setTitleVal(card.title);
  };

  return (
    <div className="home-category-card">
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
          {editingTitle ? (
            <input
              ref={titleInputRef}
              className="home-card-inline-input home-card-inline-input--title home-category-title-input"
              value={titleVal}
              placeholder="Kategorinamn"
              onChange={e => setTitleVal(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={e => {
                if (e.key === "Enter") titleInputRef.current?.blur();
                if (e.key === "Escape") { setTitleVal(card.title); setEditingTitle(false); }
              }}
            />
          ) : (
            <span
              className={"home-category-title" + (!card.title ? " home-category-title--placeholder" : "")}
              onClick={() => { setEditingTitle(true); setTimeout(() => titleInputRef.current?.focus(), 0); }}
            >
              {card.title || "Kategorinamn"}
            </span>
          )}
          <button type="button" className="home-card-icon-btn" aria-label="Redigera kategorinamn"
            onClick={() => { setEditingTitle(true); setTimeout(() => titleInputRef.current?.focus(), 0); }}>
            <PenIcon />
          </button>
        </div>

        {/* Right: add, more, toggle */}
        <div className="home-category-card-right">
          <button type="button" className="home-card-icon-btn" aria-label="Lägg till kort" onClick={onAddCard}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
              <line x1="40" y1="128" x2="216" y2="128" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16"/>
              <line x1="128" y1="40" x2="128" y2="216" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16"/>
            </svg>
          </button>
          <button type="button" className="home-card-icon-btn" aria-label="Fler alternativ">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
              <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm12-88a12,12,0,1,1-12-12A12,12,0,0,1,140,128Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,184,128Zm-88,0a12,12,0,1,1-12-12A12,12,0,0,1,96,128Z"/>
            </svg>
          </button>
          <div className="home-card-toggle">
            <Toggle checked={card.isActive} onChange={onToggle} />
          </div>
        </div>
      </div>

      {/* ── Layout picker ── */}
      {layoutOpen && (
        <div className="home-category-layout-picker">
          <span className="home-category-layout-picker-title">Visa som</span>
          <div className="home-category-layout-picker-options">
            {CATEGORY_LAYOUTS.map(l => (
              <button
                key={l.key}
                type="button"
                className={"home-category-layout-option" + (currentLayout === l.key ? " home-category-layout-option--active" : "")}
                onClick={() => { onUpdate({ ...card, layout: l.key } as any); }}
              >
                <div className="home-category-layout-option-icon">{l.icon}</div>
                <span className="home-category-layout-option-label">{l.label}</span>
              </button>
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
                <button type="button" className="home-category-empty-btn" onClick={onAddCard}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                  Lägg till länk
                </button>
              </div>
            );
          }

          return (
            <div className="home-category-card-items">
              {childCards.map(child => (
                <div key={child.id} className="home-category-card-item">
                  <CardItem
                    card={child}
                    openPanel={null}
                    onPanelToggle={() => {}}
                    onToggle={() => {}}
                    onDelete={() => {}}
                    onArchive={() => {}}
                    onUpdate={onUpdate}
                  />
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function HomePageInner({ onNavigateToArchive }: { onNavigateToArchive: () => void }) {
  const { config, updateConfig } = usePreview();
  const [showModal, setShowModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [addToCategoryId, setAddToCategoryId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<PanelKey>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const cards: Card[] = (config?.home?.cards || []) as Card[];
  const sorted = [...cards].sort((a, b) => a.sortOrder - b.sortOrder);
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
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sorted.findIndex(c => c.id === active.id);
    const newIndex = sorted.findIndex(c => c.id === over.id);
    const reordered = arrayMove(sorted, oldIndex, newIndex).map((c, i) => ({ ...c, sortOrder: i }));
    updateConfig({ home: { version: 1, links: config?.home?.links || [], cards: reordered } } as any);
    startTransition(async () => {
      await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: reordered } } as any);
    });
  }, [sorted, config, updateConfig]);

  const handleAdd = useCallback((newCard: Card) => {
    const updated = [...cards, newCard];
    updateConfig({ home: { version: 1, links: config?.home?.links || [], cards: updated } } as any);
    startTransition(async () => { await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: updated } } as any); });
    setShowModal(false);
  }, [cards, config, updateConfig]);

  const handleAddToCategory = useCallback((categoryId: string, newCard: Card) => {
    const updatedCards = [...cards, newCard];
    const updatedWithCategory = updatedCards.map(c =>
      c.id === categoryId
        ? { ...c, cardIds: [...((c as any).cardIds ?? []), newCard.id] } as Card
        : c
    );
    updateConfig({ home: { version: 1, links: config?.home?.links || [], cards: updatedWithCategory, archivedCards } } as any);
    startTransition(async () => { await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: updatedWithCategory, archivedCards } } as any); });
  }, [cards, archivedCards, config, updateConfig]);

  const handleToggle = useCallback((id: string) => {
    const updated = cards.map(c => c.id === id ? { ...c, isActive: !c.isActive } : c);
    updateConfig({ home: { version: 1, links: config?.home?.links || [], cards: updated } } as any);
    startTransition(async () => { await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: updated } } as any); });
  }, [cards, config, updateConfig]);

  const handleDelete = useCallback((id: string) => {
    const updatedCards = cards.filter(c => c.id !== id);
    updateConfig({ home: { version: 1, links: config?.home?.links || [], cards: updatedCards, archivedCards } } as any);
    startTransition(async () => { await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: updatedCards, archivedCards } } as any); });
  }, [cards, archivedCards, config, updateConfig]);

  const handleArchive = useCallback((id: string) => {
    const card = cards.find(c => c.id === id);
    if (!card) return;
    const archivedCard: ArchivedCard = { ...card, archivedAt: new Date().toISOString(), archivedReason: "manual" };
    const updatedCards = cards.filter(c => c.id !== id);
    const updatedArchive = [...archivedCards, archivedCard];
    updateConfig({ home: { version: 1, links: config?.home?.links || [], cards: updatedCards, archivedCards: updatedArchive } } as any);
    startTransition(async () => { await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: updatedCards, archivedCards: updatedArchive } } as any); });
  }, [cards, archivedCards, config, updateConfig]);

  const handleRestore = useCallback((archived: ArchivedCard) => {
    const { archivedAt: _at, archivedBy: _by, archivedReason: _r, ...cardData } = archived as any;
    const restoredCard: Card = { ...cardData, isActive: false, sortOrder: cards.length };
    const updatedCards = [...cards, restoredCard];
    const updatedArchive = archivedCards.filter(c => c.id !== archived.id);
    updateConfig({ home: { version: 1, links: config?.home?.links || [], cards: updatedCards, archivedCards: updatedArchive } } as any);
    startTransition(async () => { await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: updatedCards, archivedCards: updatedArchive } } as any); });
  }, [cards, archivedCards, config, updateConfig]);

  const handlePermanentDelete = useCallback((id: string) => {
    const updatedArchive = archivedCards.filter(c => c.id !== id);
    updateConfig({ home: { version: 1, links: config?.home?.links || [], cards, archivedCards: updatedArchive } } as any);
    startTransition(async () => { await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards, archivedCards: updatedArchive } } as any); });
  }, [cards, archivedCards, config, updateConfig]);

  const handleUpdate = useCallback((updated: Card) => {
    const newCards = cards.map(c => c.id === updated.id ? updated : c);
    updateConfig({ home: { version: 1, links: config?.home?.links || [], cards: newCards } } as any);
    startTransition(async () => { await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: newCards } } as any); });
  }, [cards, config, updateConfig]);

  const handleAddCategory = useCallback(() => {
    const newCategory: Card = {
      id: `cat_${Date.now()}`,
      type: "category",
      title: "",
      description: "",
      sortOrder: cards.length,
      isActive: true,
      layout: "stack",
      cardIds: [],
    } as any;
    const updatedCards = [...cards, newCategory];
    updateConfig({ home: { version: 1, links: config?.home?.links || [], cards: updatedCards, archivedCards } } as any);
    startTransition(async () => { await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: updatedCards, archivedCards } } as any); });
  }, [cards, archivedCards, config, updateConfig]);

  const activeDragCard = sorted.find(c => c.id === activeDragId) ?? null;

  return (
    <div className="home-content">
      <div className="home-section-header">
        <div>
          <div className="home-section-title">Kort</div>
          <div className="home-section-sub">{sorted.filter(c => c.isActive).length} aktiva</div>
        </div>
        {archivedCards.length > 0 && (
          <button type="button" className="home-archive-btn" onClick={onNavigateToArchive}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>
            </svg>
            <span>Arkiv</span>
            <span className="archive-count">{archivedCards.length}</span>
          </button>
        )}
      </div>
      <div className="home-add-row">
        <button type="button" className="home-add-row-btn" onClick={() => setShowModal(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Lägg till kort
        </button>
        <button type="button" className="home-add-row-btn home-add-row-btn--category" onClick={handleAddCategory}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256"><path d="M208,136H48a16,16,0,0,0-16,16v40a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V152A16,16,0,0,0,208,136Zm0,56H48V152H208v40Zm0-144H48A16,16,0,0,0,32,64v40a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V64A16,16,0,0,0,208,48Zm0,56H48V64H208v40Z"/></svg>
          Lägg till kategori
        </button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sorted.map(c => c.id)} strategy={verticalListSortingStrategy}>
          <div className="home-card-list">
            {sorted.length === 0 ? (
              <div className="home-empty">Inga kort ännu. Lägg till ett för att komma igång.</div>
            ) : (
              sorted.map(card =>
                card.type === "category" ? (
                  <SortableCategoryCardItem
                    key={card.id}
                    card={card}
                    onToggle={() => handleToggle(card.id)}
                    onUpdate={handleUpdate}
                    onAddCard={() => setAddToCategoryId(card.id)}
                    allCards={cards}
                  />
                ) : (
                  <SortableCardItem
                    key={card.id}
                    card={card}
                    openPanel={activeCard === card.id ? activePanel : null}
                    onPanelToggle={handlePanelToggle}
                    onToggle={() => handleToggle(card.id)}
                    onDelete={() => handleDelete(card.id)}
                    onArchive={() => handleArchive(card.id)}
                    onUpdate={handleUpdate}
                  />
                )
              )
            )}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeDragCard ? (
            <div style={{ opacity: 1, borderRadius: 16 }}>
              {activeDragCard.type === "category" ? (
                <CategoryCardItem
                  card={activeDragCard}
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

      {isPending && <div className="home-saving">Sparar...</div>}
      {showModal && createPortal(
        <AddCardModal existingCount={cards.length} onAdd={handleAdd} onClose={() => setShowModal(false)} />,
        document.body
      )}
      {addToCategoryId && createPortal(
        <AddCardModal
          existingCount={cards.length}
          onAdd={(newCard) => { handleAddToCategory(addToCategoryId, newCard); setAddToCategoryId(null); }}
          onClose={() => setAddToCategoryId(null)}
        />,
        document.body
      )}
    </div>
  );
}

const CARD_TYPES = [
  {
    type: "link", label: "Länk", description: "Öppnar en URL",
    color: "rgba(255,255,255,0.85)", bg: "#0061EF",
    icon: <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.99 17.5h1.51c3.02 0 5.5-2.47 5.5-5.5 0-3.02-2.47-5.5-5.5-5.5h-1.51M9 6.5H7.5A5.51 5.51 0 0 0 2 12c0 3.02 2.47 5.5 5.5 5.5H9M8 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  {
    type: "article", label: "Artikel", description: "Intern innehållssida",
    color: "rgba(255,255,255,0.85)", bg: "#FF7300",
    icon: <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 18V7c0-4 1-5 5-5h7c4 0 5 1 5 5v10c0 .14 0 .28-.01.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M6.35 15H20.5v3.5c0 1.93-1.57 3.5-3.5 3.5H7c-1.93 0-3.5-1.57-3.5-3.5v-.65C3.5 16.28 4.78 15 6.35 15M8 7h8m-8 3.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  {
    type: "download", label: "Ladda ner", description: "PDF eller fil",
    color: "rgba(255,255,255,0.85)", bg: "#9E65C6",
    icon: <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.44 8.9c3.6.31 5.07 2.16 5.07 6.21v.13c0 4.47-1.79 6.26-6.26 6.26H8.74c-4.47 0-6.26-1.79-6.26-6.26v-.13c0-4.02 1.45-5.87 4.99-6.2M12 2v12.88" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M15.35 12.65 12 16l-3.35-3.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  {
    type: "gallery", label: "Galleri", description: "Bildgalleri",
    color: "rgba(255,255,255,0.85)", bg: "#01A652",
    icon: <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 9v6c0 .23 0 .45-.02.67-.04-.06-.09-.12-.14-.17-.01-.01-.02-.03-.03-.04-.81-.9-2-1.46-3.31-1.46-1.26 0-2.41.52-3.23 1.36a4.5 4.5 0 0 0-.62 5.46c.22.37.5.71.82.99.02.01.03.02.04.03.05.05.1.09.16.14-.21.02-.44.02-.67.02H9c-5 0-7-2-7-7V9c0-5 2-7 7-7h6c5 0 7 2 7 7M2.52 7.11h18.96m-12.96-5v4.86m6.96-4.86v4.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M23 18.5c0 .36-.04.71-.13 1.05-.11.45-.29.88-.52 1.27A4.49 4.49 0 0 1 18.5 23a4.35 4.35 0 0 1-2.82-1.02h-.01c-.06-.05-.11-.09-.16-.14a.1.1 0 0 0-.04-.03c-.32-.28-.6-.62-.82-.99a4.5 4.5 0 0 1 .62-5.46c.82-.84 1.97-1.36 3.23-1.36 1.31 0 2.5.56 3.31 1.46.01.01.02.03.03.04.05.05.1.11.14.17.64.77 1.02 1.76 1.02 2.83m-2.82-.02h-3.36m1.68-1.64v3.36" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
] as const;

type ModalView = "type" | "form";

function AddCardModal({ existingCount, onAdd, onClose }: { existingCount: number; onAdd: (card: Card) => void; onClose: () => void }) {
  const [currentView, setCurrentView] = useState<ModalView>("type");
  const [previousView, setPreviousView] = useState<ModalView | null>(null);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setHasMounted(true), 400); return () => clearTimeout(t); }, []);
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
  const [fileType] = useState("pdf");
  const [imageUrl, setImageUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const navigateTo = useCallback((view: ModalView) => {
    if (isTransitioning) return;
    setIsTransitioning(true); setDirection("forward"); setPreviousView(currentView);
    requestAnimationFrame(() => { setTimeout(() => { setCurrentView(view); setPreviousView(null); setTimeout(() => setIsTransitioning(false), 350); }, 200); });
  }, [currentView, isTransitioning]);

  const navigateBack = useCallback(() => {
    if (isTransitioning) return;
    setIsTransitioning(true); setDirection("back"); setPreviousView(currentView);
    requestAnimationFrame(() => { setTimeout(() => { setCurrentView("type"); setPreviousView(null); setTimeout(() => setIsTransitioning(false), 350); }, 200); });
  }, [currentView, isTransitioning]);

  const exitClass  = direction === "forward" ? "modal-view-exit-left"  : "modal-view-exit-right";
  const enterClass = direction === "forward" ? "modal-view-enter-right" : "modal-view-enter-left";
  const showPrevious = previousView !== null;
  const activeView = showPrevious ? previousView : currentView;

  const handleCoverUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData(); formData.append("file", file);
      const res = await fetch("/api/tenant/upload", { method: "POST", body: formData });
      if (res.ok) { const { url: u } = await res.json(); setImageUrl(u); }
    } finally { setIsUploading(false); e.target.value = ""; }
  }, []);

  const handleSubmit = useCallback(() => {
    if (!selectedType || !title.trim()) return;
    const base = { id: `card_${Date.now()}`, sortOrder: existingCount, isActive: true, title: title.trim(), description: description.trim(), image: imageUrl || undefined, badge: badge.trim() || undefined, ctaLabel: ctaLabel.trim() || undefined };
    let card: Card;
    if      (selectedType === "link")     card = { ...base, type: "link", url, openMode };
    else if (selectedType === "article")  card = { ...base, type: "article", slug: slug || `article-${Date.now()}`, content };
    else if (selectedType === "download") card = { ...base, type: "download", fileUrl: fileUrl || url, fileType };
    else                                  card = { ...base, type: "gallery", images: imageUrl ? [imageUrl] : [] };
    onAdd(card);
  }, [selectedType, title, description, imageUrl, badge, ctaLabel, url, openMode, slug, content, fileUrl, fileType, existingCount, onAdd]);

  const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, boxSizing: "border-box", outline: "none", fontFamily: "inherit" };

  const TypeView = (
    <div style={{ display: "grid", gap: 8 }}>
      {CARD_TYPES.map(({ type, label, description: desc, icon, color, bg }) => (
        <button key={type} type="button" onClick={() => { setSelectedType(type); navigateTo("form"); }}
          className="modal-type-row">
          <div className="modal-type-icon" style={{ color, background: bg }}>{icon}</div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "2D2C2B" }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 400, color: "#666", marginTop: 2 }}>{desc}</div>
          </div>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6D6C6B" strokeWidth="1.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      ))}
    </div>
  );

  const FormView = (
    <div className="modal-form">

      {/* ── Omslagsbild (alla typer) ── */}
      <div className="modal-form-field modal-stagger-item" style={{ animationDelay: "0.04s" }}>
        <label className="modal-form-label">Omslagsbild</label>
        <ImageUpload
          value={imageUrl || undefined}
          folder="cards"
          shape="wide"
          onChange={(url) => setImageUrl(url)}
          onRemove={() => setImageUrl("")}
        />
      </div>

      {/* ── Titel (alla typer) ── */}
      <div className="modal-form-field modal-stagger-item" style={{ animationDelay: "0.08s" }}>
        <label className="modal-form-label">Titel *</label>
        <input className="modal-form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="t.ex. Aktiviteter" />
      </div>

      {/* ── Länk ── */}
      {selectedType === "link" && (<>
        <div className="modal-form-field modal-stagger-item" style={{ animationDelay: "0.12s" }}>
          <label className="modal-form-label">URL *</label>
          <input className="modal-form-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div className="modal-form-field modal-stagger-item" style={{ animationDelay: "0.16s" }}>
          <label className="modal-form-label">Öppna som</label>
          <div className="modal-form-segmented modal-form-segmented--2col">
            {(["external", "internal"] as const).map(mode => (
              <button key={mode} type="button"
                className={"modal-form-segment" + (openMode === mode ? " modal-form-segment--active" : "")}
                onClick={() => setOpenMode(mode)}>
                {mode === "external" ? "Extern" : "Intern"}
              </button>
            ))}
          </div>
        </div>
      </>)}

      {/* ── Artikel ── */}
      {selectedType === "article" && (<>
        <div className="modal-form-field modal-stagger-item" style={{ animationDelay: "0.12s" }}>
          <label className="modal-form-label">Innehåll</label>
          <textarea className="modal-form-input modal-form-textarea" value={content} onChange={e => setContent(e.target.value)} placeholder="Skriv innehåll..." rows={4} />
        </div>
        <div className="modal-form-field modal-stagger-item" style={{ animationDelay: "0.16s" }}>
          <label className="modal-form-label">Länk</label>
          <input className="modal-form-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div className="modal-form-field modal-stagger-item" style={{ animationDelay: "0.20s" }}>
          <label className="modal-form-label">Knapptext</label>
          <input className="modal-form-input" value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} placeholder="t.ex. Läs mer" />
        </div>
      </>)}

      {/* ── Ladda ner ── */}
      {selectedType === "download" && (
        <div className="modal-form-field modal-stagger-item" style={{ animationDelay: "0.12s" }}>
          <label className="modal-form-label">Fil</label>
          <ImageUpload
            value={fileUrl || undefined}
            folder="cards/files"
            shape="wide"
            placeholder="Ladda upp fil"
            onChange={(url) => setFileUrl(url)}
            onRemove={() => setFileUrl("")}
          />
        </div>
      )}

      {/* ── Skicka ── */}
      <div className="modal-form-field modal-stagger-item" style={{ animationDelay: "0.24s" }}>
        <button type="button" className={"modal-form-submit" + (title.trim() ? " modal-form-submit--active" : "")}
          onClick={handleSubmit} disabled={!title.trim()}>
          Lägg till
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div onClick={onClose} className="modal-backdrop" />
      <div className="modal-container" style={{ height: currentView === "form" ? "min(600px, 82vh)" : undefined }}>
        <div className="modal-header">
          {activeView === "type" ? (
            <span className="modal-title">Lägg till kort</span>
          ) : (
            <button type="button" onClick={navigateBack} className="modal-back-btn" style={{margin:0}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
              <span className="modal-back-label">{CARD_TYPES.find(t => t.type === selectedType)?.label ?? ""}</span>
            </button>
          )}
          <button type="button" onClick={onClose} className="modal-close-btn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="modal-body">
          <div key={activeView + (showPrevious ? "-exit" : "-enter")} className={"modal-view " + (showPrevious ? exitClass : enterClass)}>
            {activeView === "type" ? TypeView : FormView}
          </div>
        </div>
      </div>
    </>
  );
}
