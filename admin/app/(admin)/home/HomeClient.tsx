"use client";
import { useCallback, useState, useTransition, useRef } from "react";
import { createPortal } from "react-dom";
import { PreviewProvider, usePreview } from "../_components/GuestPreview";
import { GuestPreviewFrame } from "../_components/GuestPreview";
import "../_components/GuestPreview/preview.css";
import "../_components/admin-page.css";
import "./home.css";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import type { Card } from "@/app/(guest)/_lib/portal/homeLinks";
import { updateDraft } from "../_lib/tenant/updateDraft";

export default function HomeClient({ initialConfig }: { initialConfig: TenantConfig }) {
  return (
    <PreviewProvider initialConfig={initialConfig}>
      <div className="admin-page">
        <div className="admin-editor">
          <div className="admin-header">
            <h1 className="admin-title">Startsida</h1>
          </div>
          <div className="admin-content">
            <HomePageInner />
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
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fill="currentColor" d="M5 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm1 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm0 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm6-5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm1-11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/>
  </svg>
);
const PenIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" d="M2 14v-2.3l7.5-7.5 2.3 2.3L4.3 14H2Zm10.5-8.2 1.3-1.3-2.3-2.3-1.3 1.3 2.3 2.3Zm-1.35-4.65-10 10-.15.35v3l.5.5h3l.35-.15 10-10v-.7l-3-3h-.7Z" fill="currentColor"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" d="m6.83 0-.35.15-1.33 1.33-.15.35V3H0v1h2v11.5l.5.5h11l.5-.5V4h2V3h-5V1.83l-.15-.35L9.52.15 9.17 0H6.83ZM10 3v-.96L8.96 1H7.04L6 2.04V3h4ZM5 4H3v11h10V4H5Zm2 3v5H6V7h1Zm3 .5V7H9v5h1V7.5Z" fill="currentColor"/>
  </svg>
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
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fill="currentColor" d="M1.5 1v.5V1h13l.5.5V14.5l-.5.5H1.5l-.5-.5v-13l.5-.5Zm.5 9.72V14H13.75L6 7.17l-4 3.55ZM2 9.4l3.67-3.26h.66L14 12.88V2H2v7.39Zm9-3.4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/>
  </svg>
);
const StarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8.005 12.937L3.37 15.5l.885-5.428L.5 6.228l5.182-.79L8 .5l2.318 4.938 5.182.79-3.755 3.844.885 5.428-4.625-2.563Z" stroke="currentColor" strokeWidth="1.077"/>
  </svg>
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

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={onChange}
      className={"home-toggle" + (checked ? " home-toggle-on" : "")}>
      <span className="home-toggle-thumb" />
    </button>
  );
}

function CardItem({ card, onToggle, onDelete }: {
  card: Card; onToggle: () => void; onDelete: () => void;
}) {
  const typeLabel: Record<string, string> = { link: "Länk", article: "Artikel", download: "Ladda ner", gallery: "Galleri" };
  const sub = (card as any).url || (card as any).fileUrl || typeLabel[card.type] || card.type;
  return (
    <div className="home-card">
      <div className="home-card-drag"><DragIcon /></div>
      <div className="home-card-body">
        <div className="home-card-row1">
          <span className="home-card-title">{card.title}</span>
          {card.badge && <span className="home-card-badge">{card.badge}</span>}
          <button type="button" className="home-card-icon-btn" aria-label="Redigera titel"><PenIcon /></button>
        </div>
        <div className="home-card-row2">
          <span className="home-card-sub">{sub}</span>
          <button type="button" className="home-card-icon-btn" aria-label="Redigera URL"><PenIcon /></button>
        </div>
        <div className="home-card-row3">
          <div className="home-card-icons">
            <button type="button" className="home-card-icon-btn" title="Layout"><LayoutIcon /></button>
            <button type="button" className="home-card-icon-btn" title="Bild"><ImageIcon /></button>
            <button type="button" className="home-card-icon-btn" title="Badge"><StarIcon /></button>
            <button type="button" className="home-card-icon-btn" title="Schema"><CalendarIcon /></button>
          </div>
          <button type="button" className="home-card-icon-btn home-card-trash" onClick={onDelete} aria-label="Ta bort"><TrashIcon /></button>
        </div>
      </div>
      <div className="home-card-toggle">
        <Toggle checked={card.isActive} onChange={onToggle} />
      </div>
    </div>
  );
}

function HomePageInner() {
  const { config } = usePreview();
  const [showModal, setShowModal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const cards: Card[] = (config?.home?.cards || []) as Card[];

  const handleAdd = useCallback((newCard: Card) => {
    const updated = [...cards, newCard];
    startTransition(async () => { await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: updated } } as any); });
    setShowModal(false);
  }, [cards, config]);

  const handleToggle = useCallback((id: string) => {
    const updated = cards.map(c => c.id === id ? { ...c, isActive: !c.isActive } : c);
    startTransition(async () => { await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: updated } } as any); });
  }, [cards, config]);

  const handleDelete = useCallback((id: string) => {
    const updated = cards.filter(c => c.id !== id);
    startTransition(async () => { await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: updated } } as any); });
  }, [cards, config]);

  const sorted = [...cards].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="home-content">
      <div className="home-section-header">
        <div>
          <div className="home-section-title">Kort</div>
          <div className="home-section-sub">{sorted.filter(c => c.isActive).length} aktiva</div>
        </div>
        <button type="button" className="home-add-btn" onClick={() => setShowModal(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Lägg till
        </button>
      </div>
      <div className="home-card-list">
        {sorted.length === 0 ? (
          <div className="home-empty">Inga kort ännu. Lägg till ett för att komma igång.</div>
        ) : (
          sorted.map(card => (
            <CardItem key={card.id} card={card}
              onToggle={() => handleToggle(card.id)}
              onDelete={() => handleDelete(card.id)} />
          ))
        )}
      </div>
      {isPending && <div className="home-saving">Sparar...</div>}
      {showModal && createPortal(
        <AddCardModal existingCount={cards.length} onAdd={handleAdd} onClose={() => setShowModal(false)} />,
        document.body
      )}
    </div>
  );
}

const CARD_TYPES = [
  { type: "link", label: "Länk", description: "Öppnar en URL", icon: "🔗" },
  { type: "article", label: "Artikel", description: "Intern innehållssida", icon: "📄" },
  { type: "download", label: "Ladda ner", description: "PDF eller fil", icon: "⬇️" },
  { type: "gallery", label: "Galleri", description: "Bildgalleri", icon: "🖼️" },
] as const;

type ModalView = "type" | "form";

function AddCardModal({ existingCount, onAdd, onClose }: { existingCount: number; onAdd: (card: Card) => void; onClose: () => void }) {
  const [currentView, setCurrentView] = useState<ModalView>("type");
  const [previousView, setPreviousView] = useState<ModalView | null>(null);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [isTransitioning, setIsTransitioning] = useState(false);

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
    setIsTransitioning(true);
    setDirection("forward");
    setPreviousView(currentView);
    requestAnimationFrame(() => {
      setTimeout(() => {
        setCurrentView(view);
        setPreviousView(null);
        setTimeout(() => setIsTransitioning(false), 350);
      }, 200);
    });
  }, [currentView, isTransitioning]);

  const navigateBack = useCallback(() => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setDirection("back");
    setPreviousView(currentView);
    requestAnimationFrame(() => {
      setTimeout(() => {
        setCurrentView("type");
        setPreviousView(null);
        setTimeout(() => setIsTransitioning(false), 350);
      }, 200);
    });
  }, [currentView, isTransitioning]);

  const exitClass = direction === "forward" ? "modal-view-exit-left" : "modal-view-exit-right";
  const enterClass = direction === "forward" ? "modal-view-enter-right" : "modal-view-enter-left";
  const showPrevious = previousView !== null;
  const activeView = showPrevious ? previousView : currentView;

  const handleCoverUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/tenant/upload", { method: "POST", body: formData });
      if (res.ok) { const { url: u } = await res.json(); setImageUrl(u); }
    } finally { setIsUploading(false); e.target.value = ""; }
  }, []);

  const handleSubmit = useCallback(() => {
    if (!selectedType || !title.trim()) return;
    const base = { id: `card_${Date.now()}`, sortOrder: existingCount, isActive: true, title: title.trim(), description: description.trim(), image: imageUrl || undefined, badge: badge.trim() || undefined, ctaLabel: ctaLabel.trim() || undefined };
    let card: Card;
    if (selectedType === "link") card = { ...base, type: "link", url, openMode };
    else if (selectedType === "article") card = { ...base, type: "article", slug: slug || `article-${Date.now()}`, content };
    else if (selectedType === "download") card = { ...base, type: "download", fileUrl: fileUrl || url, fileType };
    else card = { ...base, type: "gallery", images: imageUrl ? [imageUrl] : [] };
    onAdd(card);
  }, [selectedType, title, description, imageUrl, badge, ctaLabel, url, openMode, slug, content, fileUrl, fileType, existingCount, onAdd]);

  const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, boxSizing: "border-box", outline: "none", fontFamily: "inherit" };

  const TypeView = (
    <div style={{ display: "grid", gap: 8 }}>
      {CARD_TYPES.map(({ type, label, description: desc, icon }, i) => (
        <button key={type} type="button"
          onClick={() => { setSelectedType(type); navigateTo("form"); }}
          className="modal-type-row modal-stagger-item"
          style={{ animationDelay: `${i * 0.04}s` }}>
          <span style={{ fontSize: 22, width: 36, textAlign: "center", flexShrink: 0 }}>{icon}</span>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{label}</div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{desc}</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      ))}
    </div>
  );

  const FormView = (
    <div style={{ display: "grid", gap: 14 }}>
      <button type="button" onClick={navigateBack} className="modal-back-btn modal-stagger-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        <span className="modal-back-label">{CARD_TYPES.find(t => t.type === selectedType)?.label ?? "Tillbaka"}</span>
      </button>
      <div className="modal-stagger-item" style={{ animationDelay: "0.04s" }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Titel *</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="t.ex. Aktiviteter" style={inputStyle} />
      </div>
      <div className="modal-stagger-item" style={{ animationDelay: "0.08s" }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Beskrivning</label>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Kort beskrivning" style={inputStyle} />
      </div>
      <div className="modal-stagger-item" style={{ animationDelay: "0.12s" }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Omslagsbild</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {imageUrl && <img src={imageUrl} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8 }} alt="" />}
          <button type="button" onClick={() => imageInputRef.current?.click()} style={{ padding: "7px 14px", border: "1px solid #e0e0e0", borderRadius: 8, background: "none", cursor: "pointer", fontSize: 13 }}>
            {isUploading ? "Laddar upp..." : imageUrl ? "Byt bild" : "+ Ladda upp"}
          </button>
          <input ref={imageInputRef} type="file" accept="image/*" onChange={handleCoverUpload} style={{ display: "none" }} />
        </div>
      </div>
      {selectedType === "link" && (
        <>
          <div className="modal-stagger-item" style={{ animationDelay: "0.16s" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>URL *</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." style={inputStyle} />
          </div>
          <div className="modal-stagger-item" style={{ animationDelay: "0.20s" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Öppna som</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {(["external", "iframe", "internal"] as const).map(mode => (
                <button key={mode} type="button" onClick={() => setOpenMode(mode)}
                  style={{ padding: "7px 4px", border: `1.5px solid ${openMode === mode ? "#1a1a1a" : "#e0e0e0"}`, borderRadius: 8, background: openMode === mode ? "#f5f5f5" : "none", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
                  {mode === "external" ? "Extern" : mode === "iframe" ? "Iframe" : "Intern"}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {selectedType === "article" && (
        <div className="modal-stagger-item" style={{ animationDelay: "0.16s" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Innehåll</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Skriv innehåll..." rows={4} style={{ ...inputStyle, resize: "vertical" }} />
        </div>
      )}
      {selectedType === "download" && (
        <div className="modal-stagger-item" style={{ animationDelay: "0.16s" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Fil-URL *</label>
          <input value={fileUrl} onChange={e => setFileUrl(e.target.value)} placeholder="https://...pdf" style={inputStyle} />
        </div>
      )}
      <div className="modal-stagger-item" style={{ animationDelay: "0.24s", display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
        <button type="button" onClick={handleSubmit} disabled={!title.trim()}
          style={{ padding: "10px 24px", border: "none", borderRadius: 10, background: title.trim() ? "#1a1a1a" : "#e0e0e0", color: title.trim() ? "#fff" : "#aaa", cursor: title.trim() ? "pointer" : "default", fontSize: 13, fontWeight: 600, transition: "background 0.2s" }}>
          Lägg till
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div onClick={onClose} className="modal-backdrop" />
      <div className="modal-container">
        <div className="modal-header">
          <span className="modal-title">{activeView === "type" ? "Lägg till kort" : "Konfigurera"}</span>
          <button type="button" onClick={onClose} className="modal-close-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
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
