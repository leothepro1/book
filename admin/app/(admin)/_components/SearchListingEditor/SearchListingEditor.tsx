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

// ── Props ────────────────────────────────────────────────────

export interface SearchListingEditorValue {
  readonly title: string;
  readonly description: string;
  readonly slug: string;
}

export interface SearchListingEditorProps {
  readonly resourceType: SeoResourceType;
  readonly entityId: string;
  readonly value: SearchListingEditorValue;
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

  const titleCounter = useSeoCharCounter(value.title, SEO_EDITOR_TITLE_MAX);
  const descCounter = useSeoCharCounter(
    value.description,
    SEO_EDITOR_DESCRIPTION_MAX,
  );

  // ── Debounced preview refresh ──
  //
  // Every `value` change schedules a single server-action call
  // 300ms after the last change. In-flight requests do not block
  // the UI; we keep showing `latestPreview` until the next
  // response arrives.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void refreshPreview({
        resourceType,
        entityId,
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

  const handleTitleChange = useCallback(
    (next: string) => onChange({ title: next, description: value.description }),
    [onChange, value.description],
  );

  const handleDescriptionChange = useCallback(
    (next: string) => onChange({ title: value.title, description: next }),
    [onChange, value.title],
  );

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
              value={value.title}
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
              value={value.description}
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
  entityId: string;
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
