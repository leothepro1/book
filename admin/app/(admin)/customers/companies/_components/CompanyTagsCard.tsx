"use client";

/**
 * CompanyTagsCard — inline-editable card for Company.tags. Lives in the
 * sidebar above Anteckningar, mirroring the BillingSettingsCard layout
 * and the BillingAddressEditCard save-when-dirty pattern.
 *
 * Tags are persisted on the Company row via updateCompanyAction (not on
 * a location), so writes here never touch CompanyLocation. The admin
 * adds tags by typing + Enter; existing tags render as pills with an ×
 * to remove. Spara/Avbryt only appear when the current set diverges
 * from the server-provided initial.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { updateCompanyAction } from "../actions";

const CARD: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

interface Props {
  companyId: string;
  initial: string[];
}

export function CompanyTagsCard({ companyId, initial }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [tags, setTags] = useState<string[]>(initial);
  const [tagInput, setTagInput] = useState("");

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync when the server re-renders with a new initial set (after
  // router.refresh or concurrent admin edits).
  useEffect(() => {
    setTags(initial);
  }, [initial]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  const addTag = useCallback(
    (raw: string) => {
      const t = raw.trim();
      if (!t || tags.includes(t)) {
        setTagInput("");
        return;
      }
      setTags([...tags, t]);
      setTagInput("");
    },
    [tags],
  );
  const removeTag = useCallback(
    (tag: string) => setTags(tags.filter((t) => t !== tag)),
    [tags],
  );

  const dirty =
    tags.length !== initial.length || tags.some((t, i) => t !== initial[i]);

  function discard() {
    setTags(initial);
    setTagInput("");
    setError(null);
  }

  function save() {
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const result = await updateCompanyAction(companyId, { tags });
      setSaving(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedAt(true);
      setTimeout(() => setSavedAt(false), 1500);
      router.refresh();
    });
  }

  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 8 }}>
        <span className="pf-card-title">Taggar</span>
      </div>

      <div className="pf-collection-trigger">
        <input
          type="text"
          className="pf-collection-trigger__input"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(tagInput);
            }
          }}
          placeholder="Lägg till tagg och tryck Enter"
          disabled={saving}
        />
      </div>

      {tags.length > 0 && (
        <div className="pf-collection-pills">
          {tags.map((tag) => (
            <span key={tag} className="pf-collection-pill">
              {tag}
              <button
                type="button"
                className="pf-collection-pill__remove"
                onClick={() => removeTag(tag)}
                aria-label={`Ta bort ${tag}`}
                disabled={saving}
              >
                <EditorIcon name="close" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="pf-error-banner" style={{ margin: "12px 0 0 0" }}>
          <EditorIcon name="error" size={16} />
          <span>{error}</span>
          <button
            type="button"
            className="pf-error-banner__close"
            onClick={() => setError(null)}
          >
            <EditorIcon name="close" size={14} />
          </button>
        </div>
      )}

      {(dirty || savedAt) && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 12,
          }}
        >
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            style={{ padding: "5px 12px", borderRadius: 8 }}
            onClick={discard}
            disabled={saving}
          >
            Avbryt
          </button>
          <button
            type="button"
            className={`admin-btn admin-btn--accent${savedAt ? " admin-btn--done" : ""}`}
            style={{ padding: "5px 12px", borderRadius: 8 }}
            onClick={save}
            disabled={saving || !dirty}
          >
            {saving ? "Sparar…" : savedAt ? "Sparat ✓" : "Spara"}
          </button>
        </div>
      )}
    </div>
  );
}
