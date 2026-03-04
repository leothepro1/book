"use client";
import { useCallback, useState, useTransition, useRef } from "react";
import { createPortal } from "react-dom";
import { PreviewProvider, usePreview } from "../_components/GuestPreview";
import { GuestPreviewFrame } from "../_components/GuestPreview";
import "../_components/GuestPreview/preview.css";
import "../_components/admin-page.css";
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
  const handleMoveUp = useCallback((id: string) => {
    const sorted = [...cards].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex(c => c.id === id);
    if (idx <= 0) return;
    const updated = sorted.map((c, i) => { if (i === idx - 1) return { ...c, sortOrder: sorted[idx].sortOrder }; if (i === idx) return { ...c, sortOrder: sorted[idx - 1].sortOrder }; return c; });
    startTransition(async () => { await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: updated } } as any); });
  }, [cards, config]);
  const handleMoveDown = useCallback((id: string) => {
    const sorted = [...cards].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex(c => c.id === id);
    if (idx >= sorted.length - 1) return;
    const updated = sorted.map((c, i) => { if (i === idx + 1) return { ...c, sortOrder: sorted[idx].sortOrder }; if (i === idx) return { ...c, sortOrder: sorted[idx + 1].sortOrder }; return c; });
    startTransition(async () => { await updateDraft({ home: { version: 1, links: config?.home?.links || [], cards: updated } } as any); });
  }, [cards, config]);
  const sorted = [...cards].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a" }}>Startsida</h1>
        <p style={{ fontSize: 14, color: "#888", marginTop: 4 }}>Hantera kort som visas i gastportalen under Upptack mer.</p>
      </div>
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #f0f0f0", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Kort ({sorted.filter(c => c.isActive).length} aktiva)</span>
          <button type="button" onClick={() => setShowModal(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "#7F22FE", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Lagg till
          </button>
        </div>
        {sorted.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "#bbb", fontSize: 14 }}>Inga kort annu.</div>
        ) : (
          <div>
            {sorted.map((card, idx) => (
              <div key={card.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: idx < sorted.length - 1 ? "1px solid #f5f5f5" : "none" }}>
                {card.image ? (
                  <div style={{ width: 48, height: 48, borderRadius: 8, flexShrink: 0, backgroundImage: `url(${card.image})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: 8, flexShrink: 0, background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="20" height="20" viewBox="0 0 256 256" fill="#ccc"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200Z"/></svg>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.title}</div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{card.type}{card.badge ? ` - ${card.badge}` : ""}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <button type="button" onClick={() => handleMoveUp(card.id)} disabled={idx === 0} style={{ padding: 6, border: "none", background: "none", cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.3 : 1, color: "#666" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>
                  </button>
                  <button type="button" onClick={() => handleMoveDown(card.id)} disabled={idx === sorted.length - 1} style={{ padding: 6, border: "none", background: "none", cursor: idx === sorted.length - 1 ? "default" : "pointer", opacity: idx === sorted.length - 1 ? 0.3 : 1, color: "#666" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                  </button>
                  <button type="button" onClick={() => handleToggle(card.id)} style={{ padding: 6, border: "none", background: "none", cursor: "pointer", color: card.isActive ? "#22c55e" : "#d1d5db" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
                  </button>
                  <button type="button" onClick={() => handleDelete(card.id)} style={{ padding: 6, border: "none", background: "none", cursor: "pointer", color: "#f87171" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {isPending && <div style={{ marginTop: 12, fontSize: 13, color: "#888" }}>Sparar...</div>}
      {showModal && createPortal(<AddCardModal existingCount={cards.length} onAdd={handleAdd} onClose={() => setShowModal(false)} />, document.body)}
    </div>
  );
}
const CARD_TYPES = [
  { type: "link", label: "Lank", description: "Oppnar en URL", icon: "link" },
  { type: "article", label: "Artikel", description: "Intern innehallssida", icon: "doc" },
  { type: "download", label: "Ladda ner", description: "PDF eller fil", icon: "dl" },
  { type: "gallery", label: "Galleri", description: "Bildgalleri", icon: "img" },
] as const;
function AddCardModal({ existingCount, onAdd, onClose }: { existingCount: number; onAdd: (card: Card) => void; onClose: () => void; }) {
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
  const [imageUrl, setImageUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const handleCoverUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/tenant/upload", { method: "POST", body: formData });
      if (res.ok) { const { url: uploadedUrl } = await res.json(); setImageUrl(uploadedUrl); }
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
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "#fff", borderRadius: 16, padding: 24, width: "min(480px, 90vw)", zIndex: 1001, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>{step === "type" ? "Valj korttyp" : "Konfigurera kort"}</span>
          <button type="button" onClick={onClose} style={{ padding: 4, border: "none", background: "none", cursor: "pointer", color: "#666" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        {step === "type" ? (
          <div style={{ display: "grid", gap: 8 }}>
            {CARD_TYPES.map(({ type, label, description: desc, icon }) => (
              <button key={type} type="button" onClick={() => { setSelectedType(type); setStep("form"); }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", border: "1.5px solid #eee", borderRadius: 12, background: "none", cursor: "pointer", textAlign: "left" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#7F22FE")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#eee")}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{label}</div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{desc}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            <div><label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Titel *</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="t.ex. Aktiviteter" style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} /></div>
            <div><label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Beskrivning</label><input value={description} onChange={e => setDescription(e.target.value)} placeholder="Kort beskrivning" style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} /></div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Omslagsbild</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {imageUrl && <img src={imageUrl} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} alt="" />}
                <button type="button" onClick={() => imageInputRef.current?.click()} style={{ padding: "7px 14px", border: "1px solid #e0e0e0", borderRadius: 8, background: "none", cursor: "pointer", fontSize: 13, color: "#555" }}>{isUploading ? "Laddar upp..." : imageUrl ? "Byt bild" : "+ Ladda upp"}</button>
                <input ref={imageInputRef} type="file" accept="image/*" onChange={handleCoverUpload} style={{ display: "none" }} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Badge (valfri)</label><input value={badge} onChange={e => setBadge(e.target.value)} placeholder="t.ex. Nytt" style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} /></div>
              <div><label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Knapptext</label><input value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} placeholder="t.ex. Las mer" style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} /></div>
            </div>
            {selectedType === "link" && (<>
              <div><label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>URL *</label><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} /></div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Oppna som</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {(["external", "iframe", "internal"] as const).map(mode => (
                    <button key={mode} type="button" onClick={() => setOpenMode(mode)} style={{ padding: "7px 4px", border: `1.5px solid ${openMode === mode ? "#7F22FE" : "#e0e0e0"}`, borderRadius: 8, background: openMode === mode ? "#f5eeff" : "none", cursor: "pointer", fontSize: 12, fontWeight: 500, color: openMode === mode ? "#7F22FE" : "#555" }}>
                      {mode === "external" ? "Extern" : mode === "iframe" ? "Iframe" : "Intern"}
                    </button>
                  ))}
                </div>
              </div>
            </>)}
            {selectedType === "article" && (<div><label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Innehall</label><textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Skriv innehall..." rows={4} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, resize: "vertical", boxSizing: "border-box" }} /></div>)}
            {selectedType === "download" && (<div><label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>Fil-URL *</label><input value={fileUrl} onChange={e => setFileUrl(e.target.value)} placeholder="https://...pdf" style={{ width: "100%", padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} /></div>)}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
              <button type="button" onClick={() => setStep("type")} style={{ padding: "9px 18px", border: "1px solid #e0e0e0", borderRadius: 8, background: "none", cursor: "pointer", fontSize: 13, color: "#555" }}>Tillbaka</button>
              <button type="button" onClick={handleSubmit} disabled={!title.trim()} style={{ padding: "9px 18px", border: "none", borderRadius: 8, background: title.trim() ? "#7F22FE" : "#e0e0e0", color: title.trim() ? "#fff" : "#aaa", cursor: title.trim() ? "pointer" : "default", fontSize: 13, fontWeight: 600 }}>Lagg till</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}