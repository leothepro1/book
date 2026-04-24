"use client";

/**
 * SearchListingEditor — "Sökmotorlistning" admin panel
 * ════════════════════════════════════════════════════
 *
 * Wraps `SearchListingPreview` in a card container with a pencil-to-
 * open edit mode. Edit mode is sticky per instance — there's no
 * explicit close button. Once entered, the fields stay expanded
 * until the parent form navigates away. The outer form owns save /
 * discard; this component is controlled by its `value` + `onChange`.
 *
 * Pattern mirrors Shopify's "Search engine listing" surface inside
 * product / collection admin pages.
 *
 * ── State model ─────────────────────────────────────────────────
 *   - mode: "pre-edit" | "during-edit" — pencil visible only in
 *     pre-edit; transition is one-way (no "done" button).
 *   - latestPreview: last resolved preview from the server. Seeded
 *     by `initialPreview` on SSR so no flash; updated by the
 *     debounced server action on every settled keystroke.
 *   - URL input is read-only in M6.1 — URL-editing ships when M11
 *     delivers the SeoRedirect middleware. Parent's `value.slug`
 *     flows through unchanged.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { EditorIcon } from "@/app/_components/EditorIcon";

import { useSeoCharCounter } from "../../_lib/seo/useSeoCharCounter";
import { previewSeoAction } from "../../_lib/seo/previewAction";
import type { SeoPreviewResult } from "@/app/_lib/seo/preview";
import type { SeoResourceType } from "@/app/_lib/seo/types";

import { SearchListingPreview } from "../SearchListingPreview/SearchListingPreview";

import "./SearchListingEditor.css";

// ── Public constants ─────────────────────────────────────────

export const SEO_EDITOR_TITLE_MAX = 70;
export const SEO_EDITOR_DESCRIPTION_MAX = 160;
const PREVIEW_DEBOUNCE_MS = 300;

// ── Per-resource static fallback labels ──────────────────────
//
// Shown as the input placeholder when BOTH the merchant's SEO
// override AND the parent form's live value are empty (the
// /new-before-typing case). Once the parent form starts feeding
// a title/description, that takes precedence — placeholder shows
// "what Google will see today" instead of generic copy.
//
// Resource types with `null` have no /new flow or no single-
// entity parent to fall back to (homepage tenant siteName is the
// Preferences' concern; accommodation_index/search aren't editable
// per-entity). Those callers will never exercise this map today.
const PARENT_FALLBACK_LABELS: Record<
  SeoResourceType,
  { title: string; description: string } | null
> = {
  product: {
    title: "Använd produkttiteln",
    description: "Använd produktbeskrivningen",
  },
  accommodation: {
    title: "Använd boendets namn",
    description: "Använd boendets beskrivning",
  },
  accommodation_category: {
    title: "Använd kategorinamnet",
    description: "Använd kategoribeskrivningen",
  },
  product_collection: {
    title: "Använd produktseriens namn",
    description: "Använd produktseriens beskrivning",
  },
  homepage: null,
  accommodation_index: null,
  product_index: null,
  page: null,
  article: null,
  blog: null,
  search: null,
};

// ── Props ────────────────────────────────────────────────────

export interface SearchListingEditorValue {
  readonly title: string;
  readonly description: string;
  readonly slug: string;
}

/**
 * The merchant's own SEO override payload — what gets persisted on
 * save. Split from `value` so the input binds to exactly what the
 * merchant has typed (not the composed fallback), and the save
 * payload never accidentally carries the parent form's title as a
 * "merchant override."
 */
export interface SearchListingEditorOverride {
  readonly title: string;
  readonly description: string;
}

export interface SearchListingEditorProps {
  readonly resourceType: SeoResourceType;
  /**
   * `null` = `/new` flow — the entity row hasn't been created yet.
   * The editor still renders the preview; the engine swaps in a
   * per-resource-type placeholder slug for the canonical URL. The
   * editor stays stateless about slug semantics — the parent form
   * passes whatever slug should display in the URL input (for /new
   * integrations, typically the same placeholder the engine uses).
   */
  readonly entityId: string | null;
  /**
   * Composed values (`override.* || parent.*`) fed by the parent
   * form. Drives preview rendering + placeholder text — the
   * "what Google will see right now" view.
   */
  readonly value: SearchListingEditorValue;
  /**
   * Raw merchant-typed overrides. Drives input binding, character
   * counters, and the save-path onChange payload. Empty string = "no
   * override" (the resolver's falsy-check + the save-boundary
   * `stripEmptySeoKeys` helper both honor this semantic).
   */
  readonly override: SearchListingEditorOverride;
  readonly onChange: (next: {
    readonly title: string;
    readonly description: string;
  }) => void;
  readonly price?: string | null;
  /**
   * SSR-prepared preview snapshot. When omitted, the component
   * renders with whatever `value` provides until the first
   * debounced server call settles.
   */
  readonly initialPreview?: {
    readonly title: string;
    readonly description: string;
    readonly displayUrl: string;
    readonly faviconUrl: string | null;
  };
}

// ── Component ────────────────────────────────────────────────

export function SearchListingEditor({
  resourceType,
  entityId,
  value,
  override,
  onChange,
  price,
  initialPreview,
}: SearchListingEditorProps) {
  const [mode, setMode] = useState<"pre-edit" | "during-edit">("pre-edit");

  const [latestPreview, setLatestPreview] = useState<PreviewShape>(
    initialPreview
      ? {
          title: initialPreview.title,
          description: initialPreview.description,
          displayUrl: initialPreview.displayUrl,
          faviconUrl: initialPreview.faviconUrl,
        }
      : {
          title: value.title || "",
          description: value.description || "",
          displayUrl: "",
          faviconUrl: null,
        },
  );

  // Counters measure the merchant's override content, not the
  // composed fallback — merchants shouldn't see red "too long"
  // warnings just because their product title is long when the
  // SEO override is blank.
  const titleCounter = useSeoCharCounter(
    override.title,
    SEO_EDITOR_TITLE_MAX,
  );
  const descCounter = useSeoCharCounter(
    override.description,
    SEO_EDITOR_DESCRIPTION_MAX,
  );

  // ── Debounced preview refresh ──
  //
  // Depends on `value.*` (composed) — when the parent form's title
  // or description changes, the composed `value` changes and we
  // refresh. This is how the live preview mirrors what Google
  // would see as the merchant types in the entity's main title
  // field, not just the SEO override.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void refreshPreview({
        resourceType,
        entityId,
        // The preview reflects the composed value — same shape
        // Google will see once the entity is saved.
        overrides: {
          title: value.title,
          description: value.description,
        },
      })
        .then((preview) => {
          if (preview !== null) setLatestPreview(preview);
        })
        .catch((error: unknown) => {
          // Non-fatal: keep last preview, console-log for
          // developer visibility. User-visible errors arrive in
          // Batch 2+ once the save path exists.
          console.warn("[SearchListingEditor] preview refresh failed", error);
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [resourceType, entityId, value.title, value.description]);

  // onChange emits the override field (what the merchant typed),
  // never the composed value. The save payload carries only
  // merchant-owned data.
  const handleTitleChange = useCallback(
    (next: string) =>
      onChange({ title: next, description: override.description }),
    [onChange, override.description],
  );

  const handleDescriptionChange = useCallback(
    (next: string) => onChange({ title: override.title, description: next }),
    [onChange, override.title],
  );

  const fallbackLabels = PARENT_FALLBACK_LABELS[resourceType];
  const titlePlaceholder =
    value.title || fallbackLabels?.title || "";
  const descriptionPlaceholder =
    value.description || fallbackLabels?.description || "";

  const fullUrl = latestPreview.displayUrl
    ? `https://${latestPreview.displayUrl.replace(/ › /g, "/")}`
    : "";

  return (
    <div className="sle">
      <div className="sle__header">
        <h3 className="sle__title">Sökmotorlistning</h3>
        {mode === "pre-edit" ? (
          <button
            type="button"
            className="sle__pencil"
            onClick={() => setMode("during-edit")}
            aria-label="Redigera sökmotorlistning"
          >
            <EditorIcon name="edit" size={16} />
          </button>
        ) : null}
      </div>

      <div className="sle__preview">
        <SearchListingPreview
          title={latestPreview.title || value.title}
          description={latestPreview.description || value.description}
          displayUrl={latestPreview.displayUrl}
          faviconUrl={latestPreview.faviconUrl}
          price={price ?? null}
        />
      </div>

      {mode === "during-edit" ? (
        <div className="sle__edit-panel">
          <div className="sle__field">
            <label className="sle__label" htmlFor="sle-title">
              Sidrubrik
            </label>
            <input
              id="sle-title"
              type="text"
              className="sle__input"
              value={override.title}
              placeholder={titlePlaceholder}
              onChange={(e) => handleTitleChange(e.target.value)}
            />
            <div
              className="sle__counter"
              style={{ color: titleCounter.color }}
            >
              {titleCounter.display}
            </div>
          </div>

          <div className="sle__field">
            <label className="sle__label" htmlFor="sle-description">
              Metabeskrivning
            </label>
            <textarea
              id="sle-description"
              className="sle__input sle__textarea"
              value={override.description}
              placeholder={descriptionPlaceholder}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              rows={3}
            />
            <div
              className="sle__counter"
              style={{ color: descCounter.color }}
            >
              {descCounter.display}
            </div>
          </div>

          <div className="sle__field">
            <label className="sle__label" htmlFor="sle-slug">
              URL-användarnamn
            </label>
            <input
              id="sle-slug"
              type="text"
              className="sle__input sle__input--readonly"
              value={value.slug}
              readOnly
              title="URL-redigering kommer i framtida version."
            />
            {fullUrl ? (
              <div className="sle__url-subtext" title={fullUrl}>
                {fullUrl}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

interface PreviewShape {
  title: string;
  description: string;
  displayUrl: string;
  faviconUrl: string | null;
}

async function refreshPreview(args: {
  resourceType: SeoResourceType;
  entityId: string | null;
  overrides: { title: string; description: string };
}): Promise<PreviewShape | null> {
  const result = await previewSeoAction({
    resourceType: args.resourceType,
    entityId: args.entityId,
    overrides: args.overrides,
  });
  if (!result.ok) return null;
  return previewShape(result.preview);
}

function previewShape(preview: SeoPreviewResult): PreviewShape {
  return {
    title: preview.title,
    description: preview.description,
    displayUrl: preview.displayUrl,
    faviconUrl: preview.faviconUrl,
  };
}
