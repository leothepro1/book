"use client";

import { useState, useRef, useEffect, useCallback, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { RichTextEditor } from "@/app/_components/RichTextEditor";
import { MediaLibraryModal } from "@/app/(admin)/_components/MediaLibrary";
import type { MediaLibraryResult } from "@/app/(admin)/_components/MediaLibrary";
import { useParams } from "next/navigation";
import { PublishBarUI } from "@/app/(admin)/_components/PublishBar/PublishBar";
import "@/app/(admin)/_components/PublishBar/publish-bar.css";
import {
  getGiftCardProduct,
  updateGiftCardProduct,
  createGiftCardProduct,
  createDesign,
  updateDesign,
  deleteDesign,
  reorderDesigns,
} from "@/app/_lib/gift-cards/actions";
import type { DesignItem, DesignConfig } from "@/app/_lib/gift-cards/actions";
import "@/app/(admin)/_components/ImageUpload/image-upload.css";
import "../../gift-cards.css";
import "../../../products/_components/product-form.css";

const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow: "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

// ── Gift Card Preview ───────────────────────────────────────────

function GiftCardPreview({ config, size = "full" }: { config: DesignConfig; size?: "full" | "thumb" }) {
  const borderRadius = size === "full" ? 20 : 10;

  const bgStyle: React.CSSProperties =
    config.bgMode === "gradient"
      ? { background: `linear-gradient(to ${config.bgGradientDir === "up" ? "top" : "bottom"}, ${config.bgColor}, ${config.bgGradientColor2})` }
      : config.bgMode === "image" && config.logoUrl
        ? { background: config.bgColor }
        : { background: config.bgColor };

  return (
    <div
      className="gc-preview"
      style={{
        ...bgStyle,
        borderRadius,
        aspectRatio: "520 / 331",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {config.bgMode === "image" && (
        // Check if there's a background image stored — for image mode,
        // the imageUrl from the design record is the background
        <div style={{ position: "absolute", inset: 0, background: config.bgColor }} />
      )}
      {config.logoUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={config.logoUrl}
          alt=""
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: "60%",
            maxHeight: "40%",
            objectFit: "contain",
          }}
        />
      )}
    </div>
  );
}

// ── Sortable Design Card ────────────────────────────────────────

function SortableDesignCard({
  design,
  onRemove,
  onEdit,
}: {
  design: DesignItem;
  onRemove: (id: string) => void;
  onEdit: (design: DesignItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: design.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="gc-dnd-item">
      <div className="gc-dnd-item__card">
        <GiftCardPreview config={design.config} size="thumb" />
      </div>
      <div className="gc-dnd-item__overlay" onClick={() => onEdit(design)}>
        <button type="button" className="gc-dnd-item__handle" {...attributes} {...listeners} onClick={(e) => e.stopPropagation()}>
          <span className="material-symbols-rounded" style={{ fontSize: 18, color: "#fff" }}>drag_indicator</span>
        </button>
        <button type="button" className="gc-dnd-item__remove" onClick={(e) => { e.stopPropagation(); onRemove(design.id); }}>
          <span className="material-symbols-rounded" style={{ fontSize: 16, color: "#fff" }}>close</span>
        </button>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────

export default function GiftCardConfigurePage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params?.id as string | undefined;
  const isCreateMode = !rawId || rawId === "new";
  const [productId, setProductId] = useState<string | null>(isCreateMode ? null : (rawId ?? null));
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState("Presentkort");
  const [description, setDescription] = useState("");
  const [designs, setDesigns] = useState<DesignItem[]>([]);
  const [minAmount, setMinAmount] = useState("500");
  const [maxAmount, setMaxAmount] = useState("10000");
  const [expiryMonths, setExpiryMonths] = useState("");
  const [view, setView] = useState<"configure" | "stats">("configure");
  const [gcStatus, setGcStatus] = useState<"ACTIVE" | "DRAFT">("DRAFT");
  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const readyRef = useRef(false);

  // Modal state (shared for add + edit)
  const [modalMounted, setModalMounted] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDesign, setEditingDesign] = useState<DesignItem | null>(null); // null = add mode

  // Delete confirm modal state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteModalMounted, setDeleteModalMounted] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  // Modal form state
  type BgMode = "fill" | "gradient" | "image";
  const [bgMode, setBgMode] = useState<BgMode>("fill");
  const [bgColor, setBgColor] = useState("#FFFFFF");
  const [bgGradientColor2, setBgGradientColor2] = useState("#000000");
  const [bgGradientDir, setBgGradientDir] = useState<"down" | "up">("down");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoLibOpen, setLogoLibOpen] = useState(false);
  const [bgImageUrl, setBgImageUrl] = useState("");
  const [bgImageLibOpen, setBgImageLibOpen] = useState(false);

  // DnD
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ── Load data ───────────────────────────────────────────────
  useEffect(() => {
    if (productId) {
      getGiftCardProduct(productId).then((p) => {
        if (p) {
          setTitle(p.title);
          setDescription(p.description);
          setDesigns(p.designs);
          setMinAmount(String(p.minAmount / 100));
          setMaxAmount(String(p.maxAmount / 100));
          setGcStatus(p.status === "ACTIVE" ? "ACTIVE" : "DRAFT");
        }
        setLoaded(true);
        // Delay marking ready so initial state changes don't trigger dirty
        setTimeout(() => { readyRef.current = true; }, 100);
      });
    } else {
      // Create mode — form starts empty
      setTitle("");
      setLoaded(true);
      setTimeout(() => { readyRef.current = true; }, 100);
    }
  }, [productId]);

  // ── Modal helpers ─────────────────────────────────────────────

  const populateForm = (design: DesignItem | null) => {
    if (design) {
      setBgMode(design.config.bgMode);
      setBgColor(design.config.bgColor);
      setBgGradientColor2(design.config.bgGradientColor2);
      setBgGradientDir(design.config.bgGradientDir);
      setLogoUrl(design.config.logoUrl);
      setBgImageUrl(design.imageUrl || "");
    } else {
      setBgMode("fill");
      setBgColor("#FFFFFF");
      setBgGradientColor2("#000000");
      setBgGradientDir("down");
      setLogoUrl("");
      setBgImageUrl("");
    }
  };

  const openAddModal = () => {
    setEditingDesign(null);
    populateForm(null);
    setModalMounted(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setModalVisible(true)));
  };

  const openEditModal = (design: DesignItem) => {
    setEditingDesign(design);
    populateForm(design);
    setModalMounted(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setModalVisible(true)));
  };

  const closeModal = () => {
    setModalVisible(false);
    setModalMounted(false);
    setEditingDesign(null);
  };

  const openDeleteModal = (id: string) => {
    setDeleteId(id);
    setDeleteModalMounted(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setDeleteModalVisible(true)));
  };

  const closeDeleteModal = () => {
    setDeleteModalVisible(false);
    setDeleteModalMounted(false);
    setDeleteId(null);
  };

  // ── Actions ───────────────────────────────────────────────────

  const handleDesignSave = () => {
    const payload = {
      logoUrl,
      bgMode,
      bgColor,
      bgGradientColor2,
      bgGradientDir,
      bgImageUrl: bgMode === "image" ? bgImageUrl : undefined,
    };

    startTransition(async () => {
      if (editingDesign) {
        if (productId) {
          const result = await updateDesign(editingDesign.id, payload);
          if ("ok" in result) {
            setDesigns((prev) => prev.map((d) => d.id === editingDesign.id ? result.design : d));
          }
        } else {
          // Local edit in create mode
          setDesigns((prev) => prev.map((d) => d.id === editingDesign.id ? {
            ...d,
            imageUrl: payload.bgImageUrl ?? "",
            config: { logoUrl: payload.logoUrl, bgMode: payload.bgMode as DesignConfig["bgMode"], bgColor: payload.bgColor, bgGradientColor2: payload.bgGradientColor2 ?? "#000000", bgGradientDir: (payload.bgGradientDir as DesignConfig["bgGradientDir"]) ?? "down" },
          } : d));
        }
        closeModal();
        markDirty();
      } else {
        if (productId) {
          const result = await createDesign(productId, payload);
          if ("ok" in result) {
            setDesigns((prev) => [...prev, result.design]);
          }
        } else {
          // Local add in create mode
          const localDesign: DesignItem = {
            id: `local_${Date.now()}`,
            name: `Mall ${designs.length + 1}`,
            imageUrl: payload.bgImageUrl ?? "",
            config: { logoUrl: payload.logoUrl, bgMode: payload.bgMode as DesignConfig["bgMode"], bgColor: payload.bgColor, bgGradientColor2: payload.bgGradientColor2 ?? "#000000", bgGradientDir: (payload.bgGradientDir as DesignConfig["bgGradientDir"]) ?? "down" },
            sortOrder: designs.length,
          };
          setDesigns((prev) => [...prev, localDesign]);
        }
        closeModal();
        markDirty();
      }
    });
  };

  const markDirty = useCallback(() => { if (readyRef.current) setDirty(true); }, []);

  const handleTitleChange = (value: string) => { setTitle(value); markDirty(); };
  const handleDescriptionChange = (value: string) => { setDescription(value); markDirty(); };
  const handleAmountChange = (field: "min" | "max", value: string) => {
    if (field === "min") setMinAmount(value); else setMaxAmount(value);
    markDirty();
  };

  const handleStatusChange = (s: "ACTIVE" | "DRAFT") => {
    setGcStatus(s);
    markDirty();
  };

  // Close status dropdown on outside click
  useEffect(() => {
    if (!statusOpen) return;
    const handle = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [statusOpen]);

  const handleExpiryChange = (value: string) => {
    setExpiryMonths(value);
    markDirty();
  };

  // ── Main save (create or update) ─────────────────────────────

  const canSave = title.trim().length > 0 && designs.length > 0;

  const handleSaveAll = async () => {
    if (!canSave) return;
    setIsSaving(true);

    try {
      if (!productId) {
        // Create mode — create product first
        const result = await createGiftCardProduct({ title: title.trim() });
        if ("ok" in result) {
          const newId = result.id;
          setProductId(newId);

          // Save settings
          const min = parseInt(minAmount, 10);
          const max = parseInt(maxAmount, 10);
          await updateGiftCardProduct(newId, {
            description,
            status: gcStatus,
            enabled: gcStatus === "ACTIVE",
            ...((!isNaN(min) && min > 0) ? { minAmount: min * 100 } : {}),
            ...((!isNaN(max) && max > 0) ? { maxAmount: max * 100 } : {}),
          });

          // Create all designs
          for (const d of designs) {
            await createDesign(newId, {
              logoUrl: d.config.logoUrl,
              bgMode: d.config.bgMode,
              bgColor: d.config.bgColor,
              bgGradientColor2: d.config.bgGradientColor2,
              bgGradientDir: d.config.bgGradientDir,
              bgImageUrl: d.imageUrl || undefined,
            });
          }

          // Redirect to the real URL
          router.replace(`/gift-cards/${newId}/configure`);
        }
      } else {
        // Edit mode — update product
        const min = parseInt(minAmount, 10);
        const max = parseInt(maxAmount, 10);
        await updateGiftCardProduct(productId, {
          title: title.trim(),
          description,
          status: gcStatus,
          enabled: gcStatus === "ACTIVE",
          ...((!isNaN(min) && min > 0) ? { minAmount: min * 100 } : {}),
          ...((!isNaN(max) && max > 0) ? { maxAmount: max * 100 } : {}),
        });
      }

      setDirty(false);
      setSavedAt(true);
      setTimeout(() => setSavedAt(false), 1500);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setIsDiscarding(true);
    if (isCreateMode) {
      router.push("/gift-cards");
    } else {
      // Reload from DB
      setLoaded(false);
      readyRef.current = false;
      getGiftCardProduct(productId!).then((p) => {
        if (p) {
          setTitle(p.title);
          setDescription(p.description);
          setDesigns(p.designs);
          setMinAmount(String(p.minAmount / 100));
          setMaxAmount(String(p.maxAmount / 100));
          setGcStatus(p.status === "ACTIVE" ? "ACTIVE" : "DRAFT");
        }
        setDirty(false);
        setLoaded(true);
        setIsDiscarding(false);
        setTimeout(() => { readyRef.current = true; }, 100);
      });
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    startTransition(async () => {
      const result = await deleteDesign(deleteId);
      if ("ok" in result) {
        setDesigns((prev) => prev.filter((d) => d.id !== deleteId));
        closeDeleteModal();
      }
    });
  };

  const handleDragEnd = useCallback((event: { active: { id: string | number }; over: { id: string | number } | null }) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setDesigns((prev) => {
      const oldIndex = prev.findIndex((d) => d.id === active.id);
      const newIndex = prev.findIndex((d) => d.id === over.id);
      const next = arrayMove(prev, oldIndex, newIndex);
      // Fire reorder in background
      reorderDesigns(next.map((d) => d.id));
      return next;
    });
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!actionsOpen) return;
    const handle = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setActionsOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [actionsOpen]);

  if (!loaded) return null;

  return (
    <div className="admin-page admin-page--no-preview products-page gc-admin-page">
      <div className="admin-editor">
        {/* ── Header ── */}
        <div className="admin-header pf-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <button
              type="button"
              className="menus-breadcrumb__icon"
              onClick={() => router.push("/gift-cards")}
              aria-label="Tillbaka till presentkort"
            >
              <span className="material-symbols-rounded" style={{ fontSize: 22 }}>redeem</span>
            </button>
            <EditorIcon name="chevron_right" size={16} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
            <span style={{ marginLeft: 3 }}>{title || "Presentkort"}</span>
          </h1>
          <div className="pf-header__actions">
            <button
              className="settings-btn--muted"
              onClick={() => setView(view === "configure" ? "stats" : "configure")}
            >
              {view === "configure" ? "Visa statistik" : "Konfigurera"}
            </button>
            <div style={{ position: "relative" }} ref={actionsRef}>
              <button className="settings-btn--muted" onClick={() => setActionsOpen(!actionsOpen)}>
                Fler åtgärder
                <EditorIcon name="expand_more" size={16} />
              </button>
              {actionsOpen && (
                <div className="pf-actions-dropdown">
                  <button className="pf-actions-dropdown__item pf-actions-dropdown__item--danger" onClick={() => setActionsOpen(false)} disabled>
                    <EditorIcon name="delete" size={18} />
                    Radera alla presentkort
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        {view === "stats" ? (
          <div style={{ margin: "0 auto", padding: "0 16px", maxWidth: 1000, width: "100%", boxSizing: "border-box" }}>
            <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
              <div className="gc-stats-header">
                <span className="gc-stats-col gc-stats-col--code">Kod</span>
                <span className="gc-stats-col gc-stats-col--recipient">Mottagare</span>
                <span className="gc-stats-col gc-stats-col--amount">Belopp</span>
                <span className="gc-stats-col gc-stats-col--balance">Saldo</span>
                <span className="gc-stats-col gc-stats-col--status">Status</span>
                <span className="gc-stats-col gc-stats-col--delivery">Leverans</span>
              </div>
              {/* Dev mock data */}
              <div className="gc-stats-row">
                <span className="gc-stats-col gc-stats-col--code gc-stats-code">APEL-K7MN-2QR4-XVWB</span>
                <span className="gc-stats-col gc-stats-col--recipient">
                  <span className="gc-stats-name">Anna Lindqvist</span>
                  <span className="gc-stats-email">anna@example.se</span>
                </span>
                <span className="gc-stats-col gc-stats-col--amount">2 500 kr</span>
                <span className="gc-stats-col gc-stats-col--balance">1 500 kr</span>
                <span className="gc-stats-col gc-stats-col--status"><span className="gc-stats-badge gc-stats-badge--active">Aktiv</span></span>
                <span className="gc-stats-col gc-stats-col--delivery">Skickad 12 mar</span>
              </div>
              <div className="gc-stats-row">
                <span className="gc-stats-col gc-stats-col--code gc-stats-code">APEL-9FT2-MNPQ-8KXZ</span>
                <span className="gc-stats-col gc-stats-col--recipient">
                  <span className="gc-stats-name">Erik Svensson</span>
                  <span className="gc-stats-email">erik@example.se</span>
                </span>
                <span className="gc-stats-col gc-stats-col--amount">5 000 kr</span>
                <span className="gc-stats-col gc-stats-col--balance">5 000 kr</span>
                <span className="gc-stats-col gc-stats-col--status"><span className="gc-stats-badge gc-stats-badge--pending">Väntar</span></span>
                <span className="gc-stats-col gc-stats-col--delivery">Skickas 24 apr</span>
              </div>
              <div className="gc-stats-row">
                <span className="gc-stats-col gc-stats-col--code gc-stats-code">APEL-3HBW-7LYP-CQRD</span>
                <span className="gc-stats-col gc-stats-col--recipient">
                  <span className="gc-stats-name">Maria Johansson</span>
                  <span className="gc-stats-email">maria@example.se</span>
                </span>
                <span className="gc-stats-col gc-stats-col--amount">1 000 kr</span>
                <span className="gc-stats-col gc-stats-col--balance">0 kr</span>
                <span className="gc-stats-col gc-stats-col--status"><span className="gc-stats-badge gc-stats-badge--redeemed">Inlöst</span></span>
                <span className="gc-stats-col gc-stats-col--delivery">Skickad 2 mar</span>
              </div>
              <div className="gc-stats-row">
                <span className="gc-stats-col gc-stats-col--code gc-stats-code">APEL-6WQZ-PRNT-4HKM</span>
                <span className="gc-stats-col gc-stats-col--recipient">
                  <span className="gc-stats-name">Lars Karlsson</span>
                  <span className="gc-stats-email">lars.karlsson@example.se</span>
                </span>
                <span className="gc-stats-col gc-stats-col--amount">10 000 kr</span>
                <span className="gc-stats-col gc-stats-col--balance">7 200 kr</span>
                <span className="gc-stats-col gc-stats-col--status"><span className="gc-stats-badge gc-stats-badge--active">Aktiv</span></span>
                <span className="gc-stats-col gc-stats-col--delivery">Skickad 8 mar</span>
              </div>
            </div>
          </div>
        ) : (
        <div className="pf-body">
          <div className="pf-main">
            {/* Card 0: Titel + Beskrivning */}
            <div style={CARD}>
              <div className="pf-field">
                <label className="admin-label">Titel</label>
                <input
                  type="text"
                  className="email-sender__input"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="T.ex. Presentkort"
                />
              </div>
              <div className="pf-field">
                <label className="admin-label">Beskrivning</label>
                <RichTextEditor
                  value={description}
                  onChange={handleDescriptionChange}
                  placeholder="Beskriv presentkortet..."
                  minHeight={120}
                  maxHeight={300}
                />
              </div>
            </div>

            {/* Card 1: Mallar */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ padding: 0, marginBottom: 8 }}>
                <span className="pf-card-title">Mallar</span>
              </div>

              {designs.length === 0 ? (
                <div className="gc-card-empty">
                  <p className="gc-card-empty__desc">
                    Inga mallar ännu. Lägg till en designmall som visas för köpare.
                  </p>
                  <button type="button" className="gc-card-empty__btn" onClick={openAddModal}>
                    Lägg till mall
                  </button>
                </div>
              ) : (
                <>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={designs.map((d) => d.id)} strategy={rectSortingStrategy}>
                      <div className="gc-dnd-grid">
                        {designs.map((d) => (
                          <SortableDesignCard key={d.id} design={d} onRemove={openDeleteModal} onEdit={openEditModal} />
                        ))}
                        {/* Add card */}
                        <button type="button" className="gc-dnd-add" onClick={openAddModal}>
                          <div className="gc-dnd-add__inner">
                            <span className="material-symbols-rounded" style={{ fontSize: 16 }}>add_circle</span>
                          </div>
                        </button>
                      </div>
                    </SortableContext>
                  </DndContext>
                </>
              )}
            </div>

            {/* Card 2: Belopp */}
            <div style={CARD}>
              <div className="pf-card-header" style={{ padding: 0, marginBottom: 8 }}>
                <span className="pf-card-title">Belopp</span>
              </div>
              <p style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)", lineHeight: 1.5, margin: "0 0 16px" }}>
                Ange minsta och högsta belopp som kunder kan köpa presentkort för.
              </p>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label className="admin-label">Minimum</label>
                  <div className="gc-amount-input">
                    <input
                      type="number"
                      className="email-sender__input gc-amount-input__field"
                      value={minAmount}
                      onChange={(e) => handleAmountChange("min", e.target.value)}
                      min={1}
                    />
                    <span className="gc-amount-input__suffix">kr</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label className="admin-label">Maximum</label>
                  <div className="gc-amount-input">
                    <input
                      type="number"
                      className="email-sender__input gc-amount-input__field"
                      value={maxAmount}
                      onChange={(e) => handleAmountChange("max", e.target.value)}
                      min={1}
                    />
                    <span className="gc-amount-input__suffix">kr</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div className="pf-sidebar">
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 8 }}>
                <span className="pf-card-title">Status</span>
              </div>
              <div className="admin-dropdown" ref={statusRef}>
                <button
                  type="button"
                  className="admin-dropdown__trigger"
                  onClick={() => setStatusOpen(!statusOpen)}
                >
                  <span className="admin-dropdown__text" style={{ textAlign: "left" }}>{gcStatus === "ACTIVE" ? "Aktiv" : "Utkast"}</span>
                  <EditorIcon name="expand_more" size={18} className="admin-dropdown__chevron" />
                </button>
                {statusOpen && (
                  <div className="admin-dropdown__list">
                    <button
                      type="button"
                      className={`admin-dropdown__item${gcStatus === "ACTIVE" ? " admin-dropdown__item--active" : ""}`}
                      onClick={() => { handleStatusChange("ACTIVE"); setStatusOpen(false); }}
                    >
                      <div style={{ flex: 1 }}>
                        <div className="admin-dropdown__text" style={{ fontWeight: 500, textAlign: "left" }}>Aktiv</div>
                        <div style={{ fontSize: 12, color: "#303030", marginTop: 2, fontWeight: 400 }}>Presentkort kan köpas av kunder</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={`admin-dropdown__item${gcStatus === "DRAFT" ? " admin-dropdown__item--active" : ""}`}
                      onClick={() => { handleStatusChange("DRAFT"); setStatusOpen(false); }}
                    >
                      <div style={{ flex: 1 }}>
                        <div className="admin-dropdown__text" style={{ fontWeight: 500, textAlign: "left" }}>Utkast</div>
                        <div style={{ fontSize: 12, color: "#303030", marginTop: 2, fontWeight: 400 }}>Presentkort är inte tillgängliga för köp</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div style={CARD}>
              <div className="pf-card-header" style={{ marginBottom: 8 }}>
                <span className="pf-card-title">Giltighetstid</span>
              </div>
              <p style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)", lineHeight: 1.5, margin: "0 0 12px" }}>
                Lämna tomt för att aldrig låta presentkort gå ut.
              </p>
              <div className="gc-amount-input">
                <input
                  type="number"
                  className="email-sender__input gc-amount-input__field"
                  value={expiryMonths}
                  onChange={(e) => handleExpiryChange(e.target.value)}
                  min={1}
                  placeholder=""
                />
                <span className="gc-amount-input__suffix">mån</span>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* ═══ Save bar ═══ */}
      <PublishBarUI
        hasUnsavedChanges={dirty}
        isPublishing={isSaving}
        isDiscarding={isDiscarding}
        isLingeringAfterPublish={savedAt}
        onPublish={handleSaveAll}
        onDiscard={handleDiscard}
      />

      {/* ═══ Add design modal ═══ */}
      {modalMounted && createPortal(
        <div className={`am-overlay${modalVisible ? " am-overlay--visible" : ""}`} onClick={closeModal}>
          <div className="am-modal" onClick={(e) => e.stopPropagation()}>
            <div className="am-modal__header">
              <h2 className="am-modal__title">{editingDesign ? "Redigera mall" : "Lägg till mall"}</h2>
              <button type="button" className="am-modal__close" onClick={closeModal} aria-label="Stäng">
                <span className="material-symbols-rounded" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
            <div className="am-modal__body">
              {/* Logotyp */}
              <div className="gc-modal-field">
                <span className="gc-modal-field__label">Logotyp</span>
                {logoUrl ? (
                  <div className="img-upload">
                    <div className="img-upload-result">
                      <div className="img-upload-result-thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={logoUrl} alt="" className="img-upload-result-img" />
                      </div>
                      <div className="img-upload-result-meta">
                        <span className="img-upload-result-filename">{logoUrl.split("/").pop() || "logotyp"}</span>
                        <button type="button" className="design-logo-btn design-logo-btn-edit" onClick={() => setLogoLibOpen(true)}>
                          <span>Ändra</span>
                        </button>
                      </div>
                      <button type="button" className="img-upload-trash-btn" onClick={() => setLogoUrl("")} aria-label="Ta bort">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path fillRule="evenodd" d="m6.83 0-.35.15-1.33 1.33-.15.35V3H0v1h2v11.5l.5.5h11l.5-.5V4h2V3h-5V1.83l-.15-.35L9.52.15 9.17 0H6.83ZM10 3v-.96L8.96 1H7.04L6 2.04V3h4ZM5 4H3v11h10V4H5Zm2 3v5H6V7h1Zm3 .5V7H9v5h1V7.5Z" fill="currentColor"/></svg>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="img-upload">
                    <div className="img-upload-empty" onClick={() => setLogoLibOpen(true)} style={{ cursor: "pointer" }}>
                      <span className="img-upload-btn">Ladda upp bild</span>
                    </div>
                  </div>
                )}
                <MediaLibraryModal open={logoLibOpen} onClose={() => setLogoLibOpen(false)} onConfirm={(a: MediaLibraryResult) => { setLogoUrl(a.url); setLogoLibOpen(false); }} currentValue={logoUrl} uploadFolder="gift-cards" accept="image" />
              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--admin-border)", margin: "16px 0" }} />

              {/* Bakgrundstyp */}
              <div className="gc-modal-field">
                <span className="gc-modal-field__label">Bakgrundstyp</span>
                <div className="gc-bg-modes">
                  {([
                    { key: "fill" as BgMode, label: "Enfärgad" },
                    { key: "gradient" as BgMode, label: "Gradient" },
                    { key: "image" as BgMode, label: "Bild" },
                  ]).map((opt) => (
                    <button key={opt.key} type="button" className={`gc-bg-mode${bgMode === opt.key ? " gc-bg-mode--active" : ""}`} onClick={() => setBgMode(opt.key)}>
                      <span className="gc-bg-mode__icon">
                        {opt.key === "fill" && <span style={{ width: "100%", height: "100%", display: "block", borderRadius: 8, background: bgColor }} />}
                        {opt.key === "gradient" && <span style={{ width: "100%", height: "100%", display: "block", borderRadius: 8, background: `linear-gradient(to ${bgGradientDir === "down" ? "bottom" : "top"}, ${bgColor}, ${bgGradientColor2})` }} />}
                        {opt.key === "image" && <span className="material-symbols-rounded" style={{ fontSize: 22, color: "var(--admin-text-tertiary)" }}>image</span>}
                      </span>
                      <span className="gc-bg-mode__label">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {bgMode === "fill" && (
                <div className="gc-modal-field">
                  <span className="gc-modal-field__label">Färg</span>
                  <div className="sf-color-row">
                    <input type="color" className="sf-color-swatch" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
                    <input type="text" className="sf-input sf-input--color-hex" value={bgColor.toUpperCase()} onChange={(e) => setBgColor(e.target.value)} maxLength={9} spellCheck={false} autoComplete="off" />
                  </div>
                </div>
              )}

              {bgMode === "gradient" && (
                <>
                  <div className="gc-modal-field">
                    <span className="gc-modal-field__label">Färg 1</span>
                    <div className="sf-color-row">
                      <input type="color" className="sf-color-swatch" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
                      <input type="text" className="sf-input sf-input--color-hex" value={bgColor.toUpperCase()} onChange={(e) => setBgColor(e.target.value)} maxLength={9} spellCheck={false} autoComplete="off" />
                    </div>
                  </div>
                  <div className="gc-modal-field">
                    <span className="gc-modal-field__label">Färg 2</span>
                    <div className="sf-color-row">
                      <input type="color" className="sf-color-swatch" value={bgGradientColor2} onChange={(e) => setBgGradientColor2(e.target.value)} />
                      <input type="text" className="sf-input sf-input--color-hex" value={bgGradientColor2.toUpperCase()} onChange={(e) => setBgGradientColor2(e.target.value)} maxLength={9} spellCheck={false} autoComplete="off" />
                    </div>
                  </div>
                  <div className="gc-modal-field">
                    <span className="gc-modal-field__label">Riktning</span>
                    <div className="gc-bg-dir">
                      {([{ key: "down" as const, label: "Nedåt" }, { key: "up" as const, label: "Uppåt" }]).map((d) => (
                        <button key={d.key} type="button" className={`gc-bg-dir__btn${bgGradientDir === d.key ? " gc-bg-dir__btn--active" : ""}`} onClick={() => setBgGradientDir(d.key)}>
                          <span className="material-symbols-rounded" style={{ fontSize: 16 }}>{d.key === "down" ? "arrow_downward" : "arrow_upward"}</span>
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {bgMode === "image" && (
                <div className="gc-modal-field">
                  <span className="gc-modal-field__label">Bakgrundsbild</span>
                  {bgImageUrl ? (
                    <div className="img-upload">
                      <div className="img-upload-result">
                        <div className="img-upload-result-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={bgImageUrl} alt="" className="img-upload-result-img" />
                        </div>
                        <div className="img-upload-result-meta">
                          <span className="img-upload-result-filename">{bgImageUrl.split("/").pop() || "bild"}</span>
                          <button type="button" className="design-logo-btn design-logo-btn-edit" onClick={() => setBgImageLibOpen(true)}><span>Ändra</span></button>
                        </div>
                        <button type="button" className="img-upload-trash-btn" onClick={() => setBgImageUrl("")} aria-label="Ta bort">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path fillRule="evenodd" d="m6.83 0-.35.15-1.33 1.33-.15.35V3H0v1h2v11.5l.5.5h11l.5-.5V4h2V3h-5V1.83l-.15-.35L9.52.15 9.17 0H6.83ZM10 3v-.96L8.96 1H7.04L6 2.04V3h4ZM5 4H3v11h10V4H5Zm2 3v5H6V7h1Zm3 .5V7H9v5h1V7.5Z" fill="currentColor"/></svg>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="img-upload">
                      <div className="img-upload-empty" onClick={() => setBgImageLibOpen(true)} style={{ cursor: "pointer" }}>
                        <span className="img-upload-btn">Ladda upp bild</span>
                      </div>
                    </div>
                  )}
                  <MediaLibraryModal open={bgImageLibOpen} onClose={() => setBgImageLibOpen(false)} onConfirm={(a: MediaLibraryResult) => { setBgImageUrl(a.url); setBgImageLibOpen(false); }} currentValue={bgImageUrl} uploadFolder="gift-cards" accept="image" />
                </div>
              )}
            </div>
            <div className="am-modal__footer">
              <button type="button" className="settings-btn--outline" onClick={closeModal}>Avbryt</button>
              <button type="button" className="settings-btn--connect" onClick={handleDesignSave} disabled={isPending}>
                {isPending ? "Sparar..." : "Spara"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ═══ Delete confirm modal ═══ */}
      {deleteModalMounted && createPortal(
        <div className={`am-overlay${deleteModalVisible ? " am-overlay--visible" : ""}`} onClick={closeDeleteModal}>
          <div className="am-modal" onClick={(e) => e.stopPropagation()}>
            <div className="am-modal__header">
              <h2 className="am-modal__title">Ta bort mall</h2>
              <button type="button" className="am-modal__close" onClick={closeDeleteModal} aria-label="Stäng">
                <span className="material-symbols-rounded" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
            <div className="am-modal__body">
              <p style={{ fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)", margin: 0, lineHeight: 1.5 }}>
                Är du säker på att du vill ta bort denna mall? Befintliga presentkort som använder mallen påverkas inte.
              </p>
            </div>
            <div className="am-modal__footer">
              <button type="button" className="settings-btn--outline" onClick={closeDeleteModal}>Avbryt</button>
              <button type="button" className="settings-btn--danger-solid" onClick={handleDelete} disabled={isPending}>
                {isPending ? "Tar bort..." : "Ta bort mall"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
