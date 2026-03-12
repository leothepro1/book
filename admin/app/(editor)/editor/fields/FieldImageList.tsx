"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { MediaLibraryModal } from "@/app/(admin)/_components/MediaLibrary";
import type { MediaLibraryResult } from "@/app/(admin)/_components/MediaLibrary";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import "@/app/(admin)/_components/ImageUpload/image-upload.css";
import { FieldWrapper } from "./FieldRenderer";
import { EditorIcon } from "@/app/_components/EditorIcon";

// ─── Data shape ──────────────────────────────────────────

export type GalleryImage = {
  src: string;
  title: string;
  description: string;
};

function parseImages(value: unknown): GalleryImage[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => {
    if (typeof v === "string") return { src: v, title: "", description: "" };
    if (v && typeof v === "object" && typeof (v as GalleryImage).src === "string") return v as GalleryImage;
    return null;
  }).filter(Boolean) as GalleryImage[];
}

// ─── Props ───────────────────────────────────────────────

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

// ─── Icons ───────────────────────────────────────────────

function DragIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path fill="currentColor" d="M5 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm1 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm0 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm6-5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm1-11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path fillRule="evenodd" d="m6.83 0-.35.15-1.33 1.33-.15.35V3H0v1h2v11.5l.5.5h11l.5-.5V4h2V3h-5V1.83l-.15-.35L9.52.15 9.17 0H6.83ZM10 3v-.96L8.96 1H7.04L6 2.04V3h4ZM5 4H3v11h10V4H5Zm2 3v5H6V7h1Zm3 .5V7H9v5h1V7.5Z" fill="currentColor" />
    </svg>
  );
}

// ─── Sortable image card ─────────────────────────────────

function SortableImageCard({
  image,
  index,
  expanded,
  onToggle,
  onUpdate,
  onRemove,
}: {
  image: GalleryImage;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<GalleryImage>) => void;
  onRemove: () => void;
}) {
  const id = `gallery-${index}`;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: isDragging ? "relative" as const : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ImageCard
        image={image}
        index={index}
        expanded={expanded}
        onToggle={onToggle}
        onUpdate={onUpdate}
        onRemove={onRemove}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function ImageCard({
  image,
  index,
  expanded,
  onToggle,
  onUpdate,
  onRemove,
  dragHandleProps,
}: {
  image: GalleryImage;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<GalleryImage>) => void;
  onRemove: () => void;
  dragHandleProps: Record<string, unknown>;
}) {
  return (
    <div className={`fm-card${expanded ? " fm-card--expanded" : ""}`}>
      {/* ── Header row ── */}
      <div className="fm-card__header" style={{ padding: 0 }}>
        {/* Drag handle */}
        <div
          className="gil-drag"
          {...dragHandleProps}
          title="Dra för att sortera"
        >
          <DragIcon />
        </div>

        {/* Image thumbnail */}
        <div className="gil-thumb">
          <img src={image.src} alt="" draggable={false} />
        </div>

        {/* Title */}
        <span className="fm-card__title" onClick={onToggle} style={{ cursor: "pointer" }}>
          {image.title || `Bild ${index + 1}`}
        </span>

        {/* Chevron */}
        <button
          type="button"
          className="gil-chevron-btn"
          onClick={onToggle}
          aria-label={expanded ? "Fäll ihop" : "Expandera"}
        >
          <EditorIcon
            name="expand_more"
            size={16}
            className={`fm-card__chevron${expanded ? " fm-card__chevron--open" : ""}`}
          />
        </button>

        {/* Remove */}
        <button
          type="button"
          className="gil-remove-btn"
          onClick={onRemove}
          aria-label="Ta bort bild"
        >
          <TrashIcon />
        </button>
      </div>

      {/* ── Expandable body ── */}
      {expanded && (
        <div className="fm-card__body">
          <label className="fm-field">
            <span className="fm-field__label">Rubrik</span>
            <input
              type="text"
              className="fm-field__input"
              value={image.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              placeholder="Ange rubrik..."
            />
          </label>
          <label className="fm-field">
            <span className="fm-field__label">Beskrivning</span>
            <textarea
              className="fm-field__textarea"
              rows={2}
              value={image.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="Ange beskrivning..."
            />
          </label>
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────

export function FieldImageList({ field, value, onChange }: Props) {
  const images = parseImages(value);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const ids = useMemo(() => images.map((_, i) => `gallery-${i}`), [images.length]);

  const emit = useCallback(
    (next: GalleryImage[]) => onChange(field.key, next),
    [field.key, onChange]
  );

  // Ref to avoid stale closure when adding multiple images in sequence
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const handleAdd = useCallback(
    (asset: MediaLibraryResult) => {
      const next = [...imagesRef.current, { src: asset.url, title: "", description: "" }];
      onChange(field.key, next);
      setLibraryOpen(false);
    },
    [field.key, onChange]
  );

  const handleRemove = useCallback(
    (idx: number) => {
      emit(images.filter((_, i) => i !== idx));
      if (expandedIdx === idx) setExpandedIdx(null);
      else if (expandedIdx !== null && expandedIdx > idx) setExpandedIdx(expandedIdx - 1);
    },
    [images, emit, expandedIdx]
  );

  const handleUpdate = useCallback(
    (idx: number, patch: Partial<GalleryImage>) => {
      const next = images.map((img, i) => (i === idx ? { ...img, ...patch } : img));
      emit(next);
    },
    [images, emit]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      emit(arrayMove(images, oldIndex, newIndex));

      // Track expanded card through reorder
      if (expandedIdx === oldIndex) setExpandedIdx(newIndex);
      else if (expandedIdx !== null) {
        if (oldIndex < expandedIdx && newIndex >= expandedIdx) setExpandedIdx(expandedIdx - 1);
        else if (oldIndex > expandedIdx && newIndex <= expandedIdx) setExpandedIdx(expandedIdx + 1);
      }
    },
    [ids, images, emit, expandedIdx]
  );

  return (
    <FieldWrapper field={field}>
      <div className="fm">
        {images.length === 0 ? (
          /* ── Empty state — upload widget ── */
          <div
            className="img-upload"
            style={{ cursor: "pointer" }}
            onClick={() => setLibraryOpen(true)}
          >
            <div className="img-upload-empty">
              <span
                className="material-symbols-rounded"
                style={{
                  fontSize: 40,
                  color: "#999",
                  fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24",
                }}
              >
                add_photo_alternate
              </span>
              <span className="img-upload-empty-text">
                Välj bilder att lägga till,<br />eller dra och släpp här
              </span>
            </div>
          </div>
        ) : (
          /* ── Sortable image list ── */
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {images.map((img, i) => (
                <SortableImageCard
                  key={ids[i]}
                  image={img}
                  index={i}
                  expanded={expandedIdx === i}
                  onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
                  onUpdate={(patch) => handleUpdate(i, patch)}
                  onRemove={() => handleRemove(i)}
                />
              ))}
            </SortableContext>
            {/* No DragOverlay — dragged item moves inline */}
          </DndContext>
        )}

        {/* ── Add button (always visible when images exist) ── */}
        {images.length > 0 && (
          <button
            type="button"
            className="fm-add"
            onClick={() => setLibraryOpen(true)}
          >
            <EditorIcon name="add_circle" size={16} />
            Lägg till bild
          </button>
        )}
      </div>

      <MediaLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onConfirm={handleAdd}
        uploadFolder="sections"
        accept="image"
        title="Välj bild"
      />
    </FieldWrapper>
  );
}
