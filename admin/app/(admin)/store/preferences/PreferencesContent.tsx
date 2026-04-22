"use client";

// TODO(admin-i18n): admin strings are hardcoded Swedish pending admin i18n layer.

import { useCallback, useEffect, useState } from "react";

import { ImageUpload } from "../../_components/ImageUpload";
import { PublishBarUI } from "../../_components/PublishBar/PublishBar";
import {
  SEO_CHAR_COUNTER_WARN_THRESHOLD,
  SEO_HOMEPAGE_DESCRIPTION_MAX,
  SEO_HOMEPAGE_TITLE_MAX,
} from "../../../_lib/seo/types";

import {
  getHomepagePreferences,
  saveHomepagePreferences,
  type HomepagePreferencesSnapshot,
} from "./actions";

// ── Shared card surface ──────────────────────────────────────
//
// Same white-rounded-card-with-shadow used across the codebase
// (AccommodationCategoryForm, ProductForm, etc.). Inline to follow
// the existing convention at those callsites.

const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

interface Draft {
  title: string;
  description: string;
  ogImagePublicId: string | null;
  ogImageUrl: string | null;
}

function snapshotToDraft(snap: HomepagePreferencesSnapshot): Draft {
  return {
    title: snap.title,
    description: snap.description,
    ogImagePublicId: snap.ogImage?.publicId ?? null,
    ogImageUrl: snap.ogImage?.url ?? null,
  };
}

function draftsEqual(a: Draft, b: Draft): boolean {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.ogImagePublicId === b.ogImagePublicId
  );
}

type CounterState = "normal" | "warn" | "error";

function counterState(length: number, max: number): CounterState {
  if (length > max) return "error";
  if (length >= Math.floor(max * SEO_CHAR_COUNTER_WARN_THRESHOLD)) return "warn";
  return "normal";
}

function counterColor(state: CounterState): string {
  switch (state) {
    case "error":
      return "var(--admin-danger)";
    case "warn":
      return "#c2410c"; // amber — no existing admin token for "warn"
    case "normal":
      return "var(--admin-text-tertiary)";
  }
}

export function PreferencesContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lingering, setLingering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<HomepagePreferencesSnapshot | null>(
    null,
  );
  const [saved, setSaved] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    getHomepagePreferences().then((snap) => {
      if (snap) {
        const initial = snapshotToDraft(snap);
        setSnapshot(snap);
        setSaved(initial);
        setDraft(initial);
      }
      setLoading(false);
    });
  }, []);

  const titleLen = (draft?.title ?? "").length;
  const descLen = (draft?.description ?? "").length;
  const titleCounter = counterState(titleLen, SEO_HOMEPAGE_TITLE_MAX);
  const descCounter = counterState(descLen, SEO_HOMEPAGE_DESCRIPTION_MAX);

  const trimmedTitle = (draft?.title ?? "").trim();
  const isDirty = saved !== null && draft !== null && !draftsEqual(draft, saved);
  const titleValid =
    trimmedTitle.length === 0 || trimmedTitle.length <= SEO_HOMEPAGE_TITLE_MAX;
  const hasErrors = titleCounter === "error" || descCounter === "error";
  const canSave = isDirty && !hasErrors && titleValid && !saving;

  const handleSave = useCallback(async () => {
    if (!draft || !canSave) return;
    setSaving(true);
    setError(null);
    const result = await saveHomepagePreferences({
      title: draft.title,
      description: draft.description,
      ogImagePublicId: draft.ogImagePublicId,
    });
    setSaving(false);
    if (result.ok) {
      setSaved(draft);
      setLingering(true);
      setTimeout(() => setLingering(false), 1500);
    } else {
      setError(result.error);
    }
  }, [draft, canSave]);

  const handleDiscard = useCallback(() => {
    if (saved) setDraft(saved);
    setError(null);
  }, [saved]);

  const handleImageChange = useCallback(
    (url: string, publicId: string) => {
      setDraft((d) =>
        d === null ? d : { ...d, ogImagePublicId: publicId, ogImageUrl: url },
      );
    },
    [],
  );

  const handleImageRemove = useCallback(() => {
    setDraft((d) =>
      d === null ? d : { ...d, ogImagePublicId: null, ogImageUrl: null },
    );
  }, []);

  if (loading || !draft || !snapshot) {
    return (
      <div className="pf-body">
        <div className="pf-main">
          <div style={CARD}>
            <div
              className="skel skel--heading"
              style={{ width: 240, marginBottom: 12 }}
            />
            <div
              className="skel skel--text"
              style={{ width: 400, marginBottom: 24 }}
            />
            <div className="skel" style={{ width: "100%", height: 200 }} />
          </div>
        </div>
      </div>
    );
  }

  const previewTitle = draft.title.trim() || snapshot.siteName;
  const previewDescription = draft.description.trim();

  return (
    <>
      <div className="pf-body">
        <div className="pf-main">
          {/* ── One card: title + description + combined preview ── */}
          <div style={CARD}>
            <div className="pf-card-header" style={{ marginBottom: 12 }}>
              <span className="pf-card-title">
                Startsidetitel och metabeskrivning
              </span>
            </div>
            <p
              className="admin-desc"
              style={{
                marginBottom: 16,
                fontSize: 13,
                lineHeight: 1.45,
                color: "var(--admin-text-secondary)",
              }}
            >
              Lämna titeln tom för att använda organisationsnamnet
              ({snapshot.siteName}). Beskrivningen visas i sökresultat
              och sociala delningar.
            </p>

            <div style={{ display: "flex", gap: 35, alignItems: "flex-start" }}>
              {/* ── LEFT: combined social-share preview (30% width) ── */}
              <div
                style={{
                  width: "30%",
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 0,
                  border: "1px solid var(--admin-border)",
                  borderRadius: "var(--radius-md)",
                  overflow: "hidden",
                  background: "#fff",
                }}
                aria-label="Förhandsgranskning av social delning"
              >
                {/* Top half: image / media picker. Picker semantics
                    are preserved even after upload — hover overlay
                    labelled "Ändra bild" lets merchant swap. The
                    filename badge is suppressed here — this surface
                    shows the image as a pure visual. */}
                <ImageUpload
                  value={draft.ogImageUrl ?? undefined}
                  onChange={handleImageChange}
                  onRemove={handleImageRemove}
                  folder="seo"
                  shape="wide"
                  placeholder="Välj bild..."
                  overlayLabel="Ändra bild"
                  showFilename={false}
                  height={140}
                />

                {/* Bottom half: social-share meta — URL caps,
                    title, description (single-line ellipsis). */}
                <div
                  style={{
                    padding: 12,
                    borderTop: "1px solid var(--admin-border)",
                    background: "var(--admin-surface-muted, #f7f7f7)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    minHeight: 0,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      color: "var(--admin-text-tertiary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {snapshot.primaryDomain}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--admin-text)",
                      lineHeight: 1.3,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={previewTitle}
                  >
                    {previewTitle}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--admin-text-secondary)",
                      lineHeight: 1.4,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={previewDescription || undefined}
                  >
                    {previewDescription || (
                      <span
                        style={{
                          color: "var(--admin-text-tertiary)",
                          fontStyle: "italic",
                        }}
                      >
                        Lägg till en metabeskrivning
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ── RIGHT: inputs (fills remaining width) ── */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="pf-field">
                  <label
                    className="admin-label"
                    htmlFor="seo-pref-title"
                    style={{ display: "block", marginBottom: 6 }}
                  >
                    Startsidetitel
                  </label>
                  <input
                    id="seo-pref-title"
                    type="text"
                    className="email-sender__input"
                    value={draft.title}
                    onChange={(e) =>
                      setDraft((d) =>
                        d === null ? d : { ...d, title: e.target.value },
                      )
                    }
                    placeholder={snapshot.siteName}
                    style={{ width: "100%" }}
                  />
                  <div
                    style={{
                      fontSize: 12,
                      marginTop: 4,
                      textAlign: "right",
                      color: counterColor(titleCounter),
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {titleLen} / {SEO_HOMEPAGE_TITLE_MAX}
                  </div>
                </div>

                <div className="pf-field">
                  <label
                    className="admin-label"
                    htmlFor="seo-pref-desc"
                    style={{ display: "block", marginBottom: 6 }}
                  >
                    Metabeskrivning
                  </label>
                  <textarea
                    id="seo-pref-desc"
                    className="email-sender__input"
                    value={draft.description}
                    onChange={(e) =>
                      setDraft((d) =>
                        d === null ? d : { ...d, description: e.target.value },
                      )
                    }
                    rows={3}
                    style={{ width: "100%", resize: "vertical" }}
                  />
                  <div
                    style={{
                      fontSize: 12,
                      marginTop: 4,
                      textAlign: "right",
                      color: counterColor(descCounter),
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {descLen} / {SEO_HOMEPAGE_DESCRIPTION_MAX}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div style={CARD}>
              <p
                style={{
                  margin: 0,
                  padding: "8px 12px",
                  background:
                    "color-mix(in srgb, var(--admin-danger) 10%, transparent)",
                  border: "1px solid var(--admin-danger)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--admin-danger)",
                  fontSize: 13,
                }}
                role="alert"
              >
                {error}
              </p>
            </div>
          )}
        </div>
      </div>

      <PublishBarUI
        hasUnsavedChanges={canSave || (isDirty && saving)}
        isPublishing={saving}
        isDiscarding={false}
        isLingeringAfterPublish={lingering}
        onPublish={handleSave}
        onDiscard={handleDiscard}
      />
    </>
  );
}
