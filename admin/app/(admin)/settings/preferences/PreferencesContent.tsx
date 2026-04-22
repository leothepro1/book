"use client";

// TODO(admin-i18n): admin strings are hardcoded Swedish pending admin i18n layer.

import { useCallback, useEffect, useState } from "react";

import { ImageUpload } from "@/app/(admin)/_components/ImageUpload";
import { PublishBarUI } from "@/app/(admin)/_components/PublishBar/PublishBar";
import { SerpPreview } from "@/app/(admin)/_components/SerpPreview/SerpPreview";
import {
  SEO_CHAR_COUNTER_WARN_THRESHOLD,
  SEO_HOMEPAGE_DESCRIPTION_MAX,
  SEO_HOMEPAGE_TITLE_MAX,
} from "@/app/_lib/seo/types";

import {
  getHomepagePreferences,
  saveHomepagePreferences,
  type HomepagePreferencesSnapshot,
} from "./actions";

type PreferencesContentProps = {
  onSubTitleChange?: (title: string | null) => void;
};

interface Draft {
  title: string;
  description: string;
  ogImagePublicId: string | null;
  /** Display-only URL for the currently-selected image. */
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
      return "#c2410c"; // orange/amber — no existing admin token for "warn"
    case "normal":
      return "var(--admin-text-tertiary)";
  }
}

export function PreferencesContent({ onSubTitleChange }: PreferencesContentProps) {
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
    onSubTitleChange?.(null);
    getHomepagePreferences().then((snap) => {
      if (snap) {
        const initial = snapshotToDraft(snap);
        setSnapshot(snap);
        setSaved(initial);
        setDraft(initial);
      }
      setLoading(false);
    });
  }, [onSubTitleChange]);

  const titleLen = (draft?.title ?? "").length;
  const descLen = (draft?.description ?? "").length;
  const titleCounter = counterState(titleLen, SEO_HOMEPAGE_TITLE_MAX);
  const descCounter = counterState(descLen, SEO_HOMEPAGE_DESCRIPTION_MAX);

  const trimmedTitle = (draft?.title ?? "").trim();
  // Save enabled only when:
  //   - dirty vs saved snapshot
  //   - title (if present) is not whitespace-only
  //   - neither field exceeds its max
  //   - not already saving
  const isDirty = saved !== null && draft !== null && !draftsEqual(draft, saved);
  const titleValid = trimmedTitle.length === 0 || trimmedTitle.length <= SEO_HOMEPAGE_TITLE_MAX;
  const hasErrors =
    titleCounter === "error" ||
    descCounter === "error" ||
    (draft !== null && draft.title.trim() !== draft.title && draft.title.length > 0 && trimmedTitle.length === 0);
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
        d === null
          ? d
          : { ...d, ogImagePublicId: publicId, ogImageUrl: url },
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
      <div style={{ padding: "24px 0" }}>
        <div className="skel skel--heading" style={{ width: 240, marginBottom: 12 }} />
        <div className="skel skel--text" style={{ width: 400, marginBottom: 24 }} />
        <div className="skel" style={{ width: "100%", height: 120, marginBottom: 24 }} />
        <div className="skel" style={{ width: "100%", height: 60, marginBottom: 12 }} />
        <div className="skel" style={{ width: "100%", height: 80 }} />
      </div>
    );
  }

  const previewTitle = draft.title.trim() || snapshot.siteName;

  return (
    <div style={{ padding: "24px 0", maxWidth: 720 }}>
      {/* ── SERP preview ─────────────────────────────── */}
      <h4
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--admin-text)",
          marginBottom: 4,
        }}
      >
        Förhandsgranskning i sökresultat
      </h4>
      <p
        className="admin-desc"
        style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.45 }}
      >
        Så här kan startsidan visas i Google. Exakt utseende varierar
        med enhet och sökterm.
      </p>
      <div style={{ marginBottom: 32 }}>
        <SerpPreview
          title={previewTitle}
          displayUrl={snapshot.primaryDomain}
          description={draft.description.trim() || null}
        />
      </div>

      {/* ── Title + description ──────────────────────── */}
      <h4
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--admin-text)",
          marginBottom: 4,
        }}
      >
        Startsidetitel och metabeskrivning
      </h4>
      <p
        className="admin-desc"
        style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.45 }}
      >
        Lämna titeln tom för att använda din organisationsnamn
        ({snapshot.siteName}). Beskrivningen visas under titeln i
        sökresultat.
      </p>

      <div style={{ marginBottom: 16 }}>
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
          className="admin-input--sm"
          value={draft.title}
          onChange={(e) =>
            setDraft((d) => (d === null ? d : { ...d, title: e.target.value }))
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

      <div style={{ marginBottom: 32 }}>
        <label
          className="admin-label"
          htmlFor="seo-pref-desc"
          style={{ display: "block", marginBottom: 6 }}
        >
          Metabeskrivning
        </label>
        <textarea
          id="seo-pref-desc"
          className="admin-textarea--sm"
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

      {/* ── OG image ─────────────────────────────────── */}
      <h4
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--admin-text)",
          marginBottom: 4,
        }}
      >
        Bild för social delning
      </h4>
      <p
        className="admin-desc"
        style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.45 }}
      >
        Rekommenderad storlek: 1200 × 630 px. Används av Facebook,
        LinkedIn och andra sociala nätverk när din startsida delas.
      </p>
      <ImageUpload
        value={draft.ogImageUrl ?? undefined}
        onChange={handleImageChange}
        onRemove={handleImageRemove}
        folder="seo"
        shape="wide"
        placeholder="Välj bild..."
      />

      {error && (
        <p
          style={{
            marginTop: 16,
            padding: "8px 12px",
            background: "color-mix(in srgb, var(--admin-danger) 10%, transparent)",
            border: "1px solid var(--admin-danger)",
            borderRadius: "var(--radius-sm)",
            color: "var(--admin-danger)",
            fontSize: 13,
          }}
          role="alert"
        >
          {error}
        </p>
      )}

      <PublishBarUI
        hasUnsavedChanges={canSave || (isDirty && saving)}
        isPublishing={saving}
        isDiscarding={false}
        isLingeringAfterPublish={lingering}
        onPublish={handleSave}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
