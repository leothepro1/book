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
 *
 * ── Auto-follow (M6.5) ──────────────────────────────────────────
 * Each field (title + description) tracks a local `"auto" | "user"`
 * mode:
 *   - AUTO: input's `value={parentTitle}` — as the merchant edits
 *     the entity's main title field, the SEO input updates in real
 *     time. Mirrors Shopify's "Page title" behaviour.
 *   - USER: input's `value={titleDraft}` — the merchant has focused
 *     the field and is authoring an explicit SEO override. Their
 *     typing is preserved across parent re-renders.
 *
 * Transitions:
 *   AUTO → USER: merchant focuses the field. Draft seeds from the
 *     current parent value so the input doesn't flicker.
 *   USER → AUTO: merchant blurs with an empty/whitespace-only
 *     draft. onChange emits "" so the parent's seoState reflects
 *     "no override"; the save-path `stripEmptySeoKeys` helper
 *     converts that to `undefined` in the persisted JSONB.
 *   Parent prop re-sync: when `override.title` (from the parent
 *     after a save/reload/form-reset) differs from the current
 *     draft, local state resets — prefers a user session still
 *     in flight over parent mutation during unrelated re-renders.
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
   * form. Drives preview rendering + debounced engine refresh — the
   * "what Google will see right now" view.
   */
  readonly value: SearchListingEditorValue;
  /**
   * Raw merchant-typed overrides. Drives save-path onChange payload
   * and the initial auto/user mode decision on mount. Empty string =
   * "no override" (the resolver's falsy check and the save-boundary
   * `stripEmptySeoKeys` helper both honor this semantic).
   */
  readonly override: SearchListingEditorOverride;
  /**
   * Raw parent-form title. Rendered directly inside the title
   * input when the field is in AUTO mode — as the merchant types
   * in the entity's main title field, the SEO input mirrors it.
   */
  readonly parentTitle: string;
  /**
   * Raw parent-form description, already HTML-stripped by the parent
   * (`stripHtml(...)`). Same AUTO-mode behaviour as parentTitle.
   */
  readonly parentDescription: string;
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
  parentTitle,
  parentDescription,
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

  // ── Auto-follow state (M6.5) ──
  //
  // `titleMode` distinguishes "input mirrors parent" (AUTO) from
  // "input shows merchant's draft" (USER). The mount-time value
  // reads from `override.title`: non-empty = existing override
  // → USER mode; empty = no override → AUTO mode.
  //
  // `titleDraft` holds the in-flight user input while in USER mode.
  // In AUTO mode it's unused (the input reads from parentTitle
  // directly). We still keep it initialized to `override.title`
  // so the first AUTO→USER transition has something to seed from.
  const [titleMode, setTitleMode] = useState<"auto" | "user">(() =>
    override.title ? "user" : "auto",
  );
  const [titleDraft, setTitleDraft] = useState(override.title);

  const [descriptionMode, setDescriptionMode] = useState<"auto" | "user">(() =>
    override.description ? "user" : "auto",
  );
  const [descriptionDraft, setDescriptionDraft] = useState(
    override.description,
  );

  // Re-sync on external override prop changes (save/reload/form
  // reset). The equality guards prevent this from fighting the
  // merchant's in-flight typing — `onChange` updates the parent's
  // seoState → `override` prop comes back with the same value →
  // draft already matches → useEffect no-ops.
  useEffect(() => {
    if (override.title !== titleDraft) {
      if (override.title) {
        setTitleMode("user");
        setTitleDraft(override.title);
      } else {
        setTitleMode("auto");
        setTitleDraft("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [override.title]);

  useEffect(() => {
    if (override.description !== descriptionDraft) {
      if (override.description) {
        setDescriptionMode("user");
        setDescriptionDraft(override.description);
      } else {
        setDescriptionMode("auto");
        setDescriptionDraft("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [override.description]);

  // Counters measure the VISIBLE value — what Google will actually
  // render. In AUTO mode that's the parent value; in USER mode
  // that's the draft. Matches Shopify.
  const displayedTitle = titleMode === "user" ? titleDraft : parentTitle;
  const displayedDescription =
    descriptionMode === "user" ? descriptionDraft : parentDescription;

  const titleCounter = useSeoCharCounter(displayedTitle, SEO_EDITOR_TITLE_MAX);
  const descCounter = useSeoCharCounter(
    displayedDescription,
    SEO_EDITOR_DESCRIPTION_MAX,
  );

  // ── Debounced preview refresh ──
  //
  // Depends on `value.*` (composed by the parent). When the parent
  // form's title or description changes the composed `value` changes
  // and we refresh — that's how the live preview mirrors what
  // Google would see as the merchant types in the main title field.
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
          // developer visibility.
          console.warn("[SearchListingEditor] preview refresh failed", error);
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [resourceType, entityId, value.title, value.description]);

  // ── Field handlers ──

  const handleTitleFocus = useCallback(() => {
    if (titleMode === "auto") {
      // Seed the draft from what the merchant currently sees, so
      // they can edit starting from the parent value without a
      // flicker to empty.
      setTitleDraft(parentTitle);
      setTitleMode("user");
    }
  }, [titleMode, parentTitle]);

  const handleTitleChange = useCallback(
    (next: string) => {
      setTitleDraft(next);
      onChange({ title: next, description: override.description });
    },
    [onChange, override.description],
  );

  const handleTitleBlur = useCallback(() => {
    if (titleMode === "user" && titleDraft.trim() === "") {
      // Merchant cleared the field + navigated away → return to
      // AUTO. onChange("") signals the parent that no override is
      // active; `stripEmptySeoKeys` at save time converts this to
      // a missing key in the DB row.
      setTitleMode("auto");
      setTitleDraft("");
      onChange({ title: "", description: override.description });
    }
  }, [titleMode, titleDraft, onChange, override.description]);

  const handleDescriptionFocus = useCallback(() => {
    if (descriptionMode === "auto") {
      setDescriptionDraft(parentDescription);
      setDescriptionMode("user");
    }
  }, [descriptionMode, parentDescription]);

  const handleDescriptionChange = useCallback(
    (next: string) => {
      setDescriptionDraft(next);
      onChange({ title: override.title, description: next });
    },
    [onChange, override.title],
  );

  const handleDescriptionBlur = useCallback(() => {
    if (descriptionMode === "user" && descriptionDraft.trim() === "") {
      setDescriptionMode("auto");
      setDescriptionDraft("");
      onChange({ title: override.title, description: "" });
    }
  }, [descriptionMode, descriptionDraft, onChange, override.title]);

  // ── Placeholder + URL derivations ──

  const fallbackLabels = PARENT_FALLBACK_LABELS[resourceType];
  // AUTO mode: no placeholder — the field already displays the
  // parent value. USER mode: only show the static fallback when
  // both draft and parent are empty (the /new-empty case).
  const titlePlaceholder =
    titleMode === "user" && !titleDraft && !parentTitle
      ? fallbackLabels?.title ?? ""
      : "";
  const descriptionPlaceholder =
    descriptionMode === "user" && !descriptionDraft && !parentDescription
      ? fallbackLabels?.description ?? ""
      : "";

  const fullUrl = latestPreview.displayUrl
    ? `https://${latestPreview.displayUrl.replace(/ › /g, "/")}`
    : "";

  // Input-bound values: AUTO reads parent directly; USER reads draft.
  const titleInputValue = titleMode === "user" ? titleDraft : parentTitle;
  const descriptionInputValue =
    descriptionMode === "user" ? descriptionDraft : parentDescription;

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
              value={titleInputValue}
              placeholder={titlePlaceholder}
              onFocus={handleTitleFocus}
              onChange={(e) => handleTitleChange(e.target.value)}
              onBlur={handleTitleBlur}
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
              value={descriptionInputValue}
              placeholder={descriptionPlaceholder}
              onFocus={handleDescriptionFocus}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              onBlur={handleDescriptionBlur}
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
