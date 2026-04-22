"use client";

/**
 * EditableCard — always-editable card with per-card Spara / Avbryt footer.
 *
 * Reconciles two competing patterns:
 *   1. Existing products/accommodations pattern — inputs always editable,
 *      one global PublishBar at the bottom.
 *   2. FAS 5 spec — "each card saves independently; no single Save-all".
 *
 * Resolution: inputs stay always-editable (no "Redigera" toggle), but each
 * card owns its own dirty flag and renders its own Save / Cancel footer
 * when anything inside it differs from the last saved snapshot.
 *
 * Contract:
 *   - Parent passes `initial` — the last-saved draft; card tracks dirty by
 *     deep-equal against this reference.
 *   - Parent supplies an `onSave(draft)` that returns `{ ok, error }` and
 *     the card handles spinner + error banner + success linger.
 *   - Parent renders the actual input controls via a render-prop that
 *     receives a `set(patch)` helper.
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

export interface EditableCardState<T> {
  draft: T;
  set: (patch: Partial<T>) => void;
  saving: boolean;
  error: string | null;
}

export interface EditableCardProps<T> {
  title: string;
  initial: T;
  /** Save handler — receives the FULL draft snapshot. Must return
   *  `{ ok: true }` on success or `{ ok: false, error: string }` on failure.
   *  Errors surface as a banner inside the card footer and auto-clear after 5s. */
  onSave: (draft: T) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Render-prop body that consumes the draft state. */
  children: (state: EditableCardState<T>) => ReactNode;
  /** Optional extra content rendered above the footer when dirty. */
  extraFooter?: ReactNode;
}

export function EditableCard<T extends object>({
  title,
  initial,
  onSave,
  children,
  extraFooter,
}: EditableCardProps<T>) {
  const [draft, setDraft] = useState<T>(initial);
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lingering, setLingering] = useState(false);
  const savedSnapshotRef = useRef<T>(initial);

  const dirty = useMemo(
    () => !stableEqual(draft, savedSnapshotRef.current),
    [draft],
  );

  const set = useCallback((patch: Partial<T>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setError(null);
  }, []);

  const handleSave = useCallback(() => {
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const result = await onSave(draft);
      setSaving(false);
      if (result.ok) {
        savedSnapshotRef.current = draft;
        setLingering(true);
        setTimeout(() => setLingering(false), 1500);
      } else {
        setError(result.error);
        setTimeout(() => setError(null), 5000);
      }
    });
  }, [draft, onSave]);

  const handleCancel = useCallback(() => {
    setDraft(savedSnapshotRef.current);
    setError(null);
  }, []);

  const busy = saving || isPending;

  return (
    <section className="co-card co-card--editable">
      <div className="co-card__header">
        <h2 className="co-card__title">{title}</h2>
      </div>
      <div className="co-card__body">
        {children({ draft, set, saving: busy, error })}
      </div>
      {extraFooter}
      {(dirty || lingering) && (
        <div className="co-card__footer">
          {error ? (
            <div className="co-card__error" role="alert">
              {error}
            </div>
          ) : null}
          <div className="co-card__footer-actions">
            <button
              type="button"
              className="co-btn co-btn--ghost"
              onClick={handleCancel}
              disabled={busy || lingering}
            >
              Avbryt
            </button>
            <button
              type="button"
              className={`co-btn co-btn--primary${lingering ? " co-btn--done" : ""}`}
              onClick={handleSave}
              disabled={busy || lingering}
            >
              {busy ? "Sparar…" : lingering ? "Sparat ✓" : "Spara"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Shallow structural equality with special-casing for the concrete shapes we
 * edit: strings, numbers, booleans, null, arrays of those, and plain object
 * blobs. Good enough for the draft payloads we pass to this component — we
 * never put class instances or BigInts in EditableCard drafts (money lives
 * on its own non-card inputs).
 */
function stableEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!stableEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao);
  const bKeys = Object.keys(bo);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!stableEqual(ao[k], bo[k])) return false;
  }
  return true;
}
