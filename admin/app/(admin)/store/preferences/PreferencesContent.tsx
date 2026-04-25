"use client";

// TODO(admin-i18n): admin strings are hardcoded Swedish pending admin i18n layer.

import { useCallback, useEffect, useState } from "react";

import { EditorIcon } from "@/app/_components/EditorIcon";
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

// Reuse the .email-nav row layout (icon + label + desc, optional
// trailing element) from /settings/email. Generic styles, no email-
// specific selectors — picked here for the new toggle row above
// "Startsidetitel och metabeskrivning". Cross-feature CSS imports
// load globally in Next.js, so this just brings the classnames into
// scope without duplication.
import "../../settings/email/email.css";
// Preferences-page-local overrides (e.g. .pf-static-row neutralising
// the email-nav hover highlight on non-clickable rows).
import "./preferences.css";

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
  /** Storefront-wide "discourage search engines" toggle (M6.6b). */
  noindex: boolean;
}

function snapshotToDraft(snap: HomepagePreferencesSnapshot): Draft {
  return {
    title: snap.title,
    description: snap.description,
    ogImagePublicId: snap.ogImage?.publicId ?? null,
    ogImageUrl: snap.ogImage?.url ?? null,
    noindex: snap.noindex,
  };
}

function draftsEqual(a: Draft, b: Draft): boolean {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.ogImagePublicId === b.ogImagePublicId &&
    a.noindex === b.noindex
  );
}

// Hard limits for the Butiksåtkomst inputs. Same warn-threshold logic
// as the SEO counters above; chosen to match the merchant-facing copy
// ("x av 100", "0 av 5 000").
const ACCESS_PASSWORD_MAX = 100;
const ACCESS_MESSAGE_MAX = 5000;

// Swedish locale grouping renders 5000 as "5 000". Lazy-instantiate
// once at module level since the formatter is reused on every keystroke
// of the message textarea.
const ACCESS_MESSAGE_FORMATTER = new Intl.NumberFormat("sv-SE");

type CounterState = "normal" | "warn" | "error";

function counterState(length: number, max: number): CounterState {
  if (length > max) return "error";
  if (length >= Math.floor(max * SEO_CHAR_COUNTER_WARN_THRESHOLD)) return "warn";
  return "normal";
}

// Mirrors the Toggle helper in app/(admin)/home/HomeClient.tsx:376.
// Inlined rather than cross-imported between client components so each
// feature owns its own surface; the .admin-toggle CSS in base.css is
// the single source of truth for the visual.
function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={"admin-toggle" + (checked ? " admin-toggle-on" : "")}
    >
      <span className="admin-toggle-icon admin-toggle-icon--check material-symbols-rounded">
        check
      </span>
      <span className="admin-toggle-icon admin-toggle-icon--remove material-symbols-rounded">
        remove
      </span>
      <span className="admin-toggle-thumb" />
    </button>
  );
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

  // Placeholder state for the Butiksåtkomst card (above "Startsidetitel
  // och metabeskrivning"). Not yet wired to any persisted setting —
  // local-only for now; the parent will get a real binding once the
  // backend shape is decided.
  const [togglePlaceholder, setTogglePlaceholder] = useState(false);
  const [accessPassword, setAccessPassword] = useState("");
  const [accessMessage, setAccessMessage] = useState("");

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
      noindex: draft.noindex,
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
          {/* ── Butiksåtkomst card (UI scaffold — toggle not wired yet).
              Mirrors the Container 2 / .email-nav pattern from the
              /settings/email page: outer CARD surface + inner .email-nav
              row. Swaps: chevron → iOS toggle (base.css), and
              .pf-static-row neutralises the email-nav hover background
              since only the toggle is interactive here. */}
          <div style={CARD}>
            <div className="pf-card-header" style={{ marginBottom: 12 }}>
              <span className="pf-card-title">Butiksåtkomst</span>
            </div>
            <div className="email-nav">
              <div className="email-nav__item pf-static-row">
                <EditorIcon
                  name="lock"
                  size={20}
                  style={{
                    color: "var(--admin-text-secondary)",
                    flexShrink: 0,
                  }}
                />
                <div className="email-nav__text">
                  <div className="email-nav__label">Lösenordsskydd</div>
                  <div className="email-nav__desc">
                    Begränsa åtkomst för besökare med lösenordet
                  </div>
                </div>
                <Toggle
                  checked={togglePlaceholder}
                  onChange={() => setTogglePlaceholder((v) => !v)}
                />
              </div>

              {/* Fold-down panel — animates open when the toggle is on.
                  The grid-template-rows trick (preferences.css) lets the
                  natural content height drive the transition. Inputs +
                  counters reuse the same .email-sender__input + .admin-label
                  + counterColor pattern as the "Startsidetitel" card. */}
              <div
                className={
                  "pf-collapse" +
                  (togglePlaceholder ? " pf-collapse--open" : "")
                }
                aria-hidden={!togglePlaceholder}
              >
                <div className="pf-collapse__inner">
                  <div className="pf-collapse__panel">
                    {/* Lösenord */}
                    <div>
                      <label
                        className="admin-label"
                        htmlFor="pf-access-password"
                        style={{ display: "block", marginBottom: 6 }}
                      >
                        Lösenord
                      </label>
                      <input
                        id="pf-access-password"
                        type="text"
                        className="email-sender__input"
                        value={accessPassword}
                        onChange={(e) => setAccessPassword(e.target.value)}
                        style={{ width: "100%" }}
                        disabled={!togglePlaceholder}
                      />
                      <div className="pf-counter">
                        {accessPassword.length} av {ACCESS_PASSWORD_MAX} tecken använda
                      </div>
                    </div>

                    {/* Meddelande till dina besökare */}
                    <div>
                      <label
                        className="admin-label"
                        htmlFor="pf-access-message"
                        style={{ display: "block", marginBottom: 6 }}
                      >
                        Meddelande till dina besökare
                      </label>
                      <textarea
                        id="pf-access-message"
                        className="email-sender__input"
                        value={accessMessage}
                        onChange={(e) => setAccessMessage(e.target.value)}
                        style={{
                          display: "block",
                          width: "100%",
                          minHeight: 180,
                          padding: "10px 12px",
                          resize: "vertical",
                        }}
                        disabled={!togglePlaceholder}
                      />
                      <div className="pf-counter">
                        {ACCESS_MESSAGE_FORMATTER.format(accessMessage.length)} av{" "}
                        {ACCESS_MESSAGE_FORMATTER.format(ACCESS_MESSAGE_MAX)} tecken använda
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── One card: title + description + combined preview ── */}
          <div style={CARD}>
            <div className="pf-card-header" style={{ marginBottom: 12 }}>
              <span className="pf-card-title">
                Startsidetitel och metabeskrivning
              </span>
            </div>
            <div style={{ display: "flex", gap: 35, alignItems: "flex-start" }}>
              {/* ── LEFT: combined social-share preview (36% width) ──
                  pf-share-preview scopes the image-slot overrides
                  (height/min-height/border) to this surface only. */}
              <div
                className="pf-share-preview"
                style={{
                  width: "36%",
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 0,
                  border: "1px solid #EBEBEB",
                  borderRadius: "0.75rem",
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
                  <div className="pf-counter">
                    {titleLen} av {SEO_HOMEPAGE_TITLE_MAX} tecken använda
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
                    style={{
                      display: "block",
                      width: "100%",
                      minHeight: 180,
                      padding: "10px 12px",
                      resize: "vertical",
                    }}
                  />
                  <div className="pf-counter">
                    {descLen} av {SEO_HOMEPAGE_DESCRIPTION_MAX} tecken använda
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sökmotorsynlighet UI removed — `draft.noindex` and the
              save-path persistence remain in place for a future surface. */}

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
