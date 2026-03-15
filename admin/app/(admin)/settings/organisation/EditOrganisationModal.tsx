"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { MediaLibraryModal } from "@/app/(admin)/_components/MediaLibrary";
import type { MediaLibraryResult } from "@/app/(admin)/_components/MediaLibrary";
import {
  updateClerkOrgName,
  updateOrganisationImage,
  deleteOrganisationImage,
} from "./actions";

function ButtonSpinner({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [animState, setAnimState] = useState<"enter" | "exit" | "idle">("idle");
  const prevVisible = useRef(visible);

  useEffect(() => {
    if (visible && !prevVisible.current) {
      setMounted(true);
      setAnimState("enter");
    } else if (!visible && prevVisible.current) {
      setAnimState("exit");
    }
    prevVisible.current = visible;
  }, [visible]);

  const handleAnimationEnd = () => {
    if (animState === "exit") { setMounted(false); setAnimState("idle"); }
    else if (animState === "enter") { setAnimState("idle"); }
  };

  if (!mounted) return null;
  return (
    <svg className={`btn-spinner ${animState === "exit" ? "btn-spinner--out" : ""}`}
      width="18" height="18" viewBox="0 0 21 21" fill="none"
      style={{ marginTop: 1 }} onAnimationEnd={handleAnimationEnd} aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
    </svg>
  );
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  currentName: string;
  currentLogoUrl: string | null;
  onSuccess: () => void;
};

export function EditOrganisationModal({
  isOpen,
  onClose,
  currentName,
  currentLogoUrl,
  onSuccess,
}: Props) {
  const [name, setName] = useState(currentName);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [markDeleteImage, setMarkDeleteImage] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setSelectedImageUrl(null);
      setMarkDeleteImage(false);
      setShowMediaLibrary(false);
      setError(null);
    }
  }, [isOpen, currentName]);

  if (!isOpen) return null;

  const nameChanged = name.trim() !== currentName;
  const imageChanged = selectedImageUrl !== null || markDeleteImage;
  const hasChanges = nameChanged || imageChanged;

  // Determine displayed image
  let displayImage: string | null = null;
  if (selectedImageUrl) {
    displayImage = selectedImageUrl;
  } else if (!markDeleteImage && currentLogoUrl) {
    displayImage = currentLogoUrl;
  }

  function handleMediaSelect(asset: MediaLibraryResult) {
    setSelectedImageUrl(asset.url);
    setMarkDeleteImage(false);
    setShowMediaLibrary(false);
    setError(null);
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);

    try {
      // Update image via URL (Clerk accepts URL for logo)
      if (selectedImageUrl) {
        const result = await updateOrganisationImage(selectedImageUrl);
        if (!result.ok) {
          setError(result.error ?? "Kunde inte uppdatera bilden");
          setIsSaving(false);
          return;
        }
      }

      // Delete image
      if (markDeleteImage && !selectedImageUrl) {
        const result = await deleteOrganisationImage();
        if (!result.ok) {
          setError(result.error ?? "Kunde inte ta bort bilden");
          setIsSaving(false);
          return;
        }
      }

      // Update name
      if (nameChanged) {
        const result = await updateClerkOrgName(name.trim());
        if (!result.ok) {
          setError(result.error ?? "Kunde inte uppdatera namnet");
          setIsSaving(false);
          return;
        }
      }

      onSuccess();
      onClose();
    } catch {
      setError("Ett oväntat fel uppstod — försök igen");
    } finally {
      setIsSaving(false);
    }
  }

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div style={{
        position: "absolute", inset: 0,
        background: "var(--admin-overlay)",
        animation: "settings-modal-fade-in 0.15s ease",
      }} />

      {/* Modal */}
      <div
        style={{
          position: "relative", zIndex: 1,
          background: "var(--admin-surface)",
          borderRadius: 16, padding: 0, width: 440,
          boxShadow: "none",
          animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "#F9F8F7", borderBottom: "1px solid #E6E5E3",
          padding: "20px 20px 12px 20px", borderRadius: "16px 16px 0 0",
        }}>
          <h3 style={{ fontSize: 17, fontWeight: 600 }}>Redigera organisation</h3>
          <button
            onClick={onClose}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: "max-content", height: "max-content",
              border: "none", background: "transparent",
              borderRadius: "50%", cursor: "pointer", color: "var(--admin-text-secondary)",
            }}
            aria-label="Stäng"
          >
            <EditorIcon name="close" size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20 }}>
          {/* Section A — Profilbild */}
          <div style={{ marginBottom: 24 }}>
            <label className="admin-label" style={{ marginBottom: 12 }}>Profilbild</label>

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {/* Image preview */}
              {displayImage ? (
                <img
                  src={displayImage}
                  alt="Organisation"
                  style={{ width: 70, height: 70, borderRadius: 12, objectFit: "cover", flexShrink: 0 }}
                />
              ) : (
                <div style={{
                  width: 70, height: 70, borderRadius: 12, flexShrink: 0,
                  background: "var(--admin-accent)", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 28, fontWeight: 600,
                }}>
                  {currentName[0]?.toUpperCase()}
                </div>
              )}

              {displayImage ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="settings-btn--test"
                    onClick={() => setShowMediaLibrary(true)}
                  >
                    Redigera
                  </button>
                  <button
                    className="settings-btn--outline"
                    onClick={() => {
                      setMarkDeleteImage(true);
                      setSelectedImageUrl(null);
                    }}
                  >
                    Ta bort
                  </button>
                </div>
              ) : (
                <button
                  className="settings-btn--test"
                  onClick={() => setShowMediaLibrary(true)}
                >
                  Välj bild
                </button>
              )}
            </div>

            <MediaLibraryModal
              open={showMediaLibrary}
              onClose={() => setShowMediaLibrary(false)}
              onConfirm={handleMediaSelect}
              currentValue={displayImage ?? undefined}
              uploadFolder="logos"
              accept="image"
              title="Välj profilbild"
            />
          </div>

          {/* Section B — Organisationsnamn */}
          <div>
            <label className="admin-label">Organisationsnamn</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="admin-float-input"
              style={{ padding: "10px 12px", width: "100%" }}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              marginTop: 16, padding: "10px 14px", borderRadius: 10,
              background: "#FBE9E7", color: "#C62828",
              fontSize: 13, fontWeight: 500,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <EditorIcon name="error" size={18} />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 8,
          padding: "12px 20px 20px", borderTop: "1px solid #E6E5E3",
        }}>
          <button
            className="settings-btn--outline"
            style={{ border: "none" }}
            disabled={isSaving}
            onClick={onClose}
          >
            Avbryt
          </button>
          <button
            className="settings-btn--connect"
            disabled={isSaving || !hasChanges || !name.trim()}
            onClick={handleSave}
          >
            <ButtonSpinner visible={isSaving} />
            Spara
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
