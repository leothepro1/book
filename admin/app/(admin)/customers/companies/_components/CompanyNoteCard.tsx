"use client";

/**
 * CompanyNoteCard — identisk container + modal-lösning med ordrar och
 * kunder. Renderas i pf-sidebar, både på /new (för nystart) och på
 * konfigurera-sidan. Data:
 *   /new        → lokalt state, skickas som del av createCompany-payloaden
 *   konfigurera → läser Company.note, sparar via updateCompanyAction
 *
 * Denna komponent är konfigurera-varianten. /new-varianten sitter inline
 * i CompanyCreateForm eftersom note är bara en state där.
 */

import { useEffect, useState, useTransition } from "react";
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

export function CompanyNoteCard({
  companyId,
  initialNote,
}: {
  companyId: string;
  initialNote: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [note, setNote] = useState(initialNote ?? "");
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hålla lokalt state synkat om server-refetch ger nytt värde
  useEffect(() => {
    setNote(initialNote ?? "");
  }, [initialNote]);

  function openEdit() {
    setDraft(note);
    setError(null);
    setModalOpen(true);
  }

  function saveNote() {
    const trimmed = draft.trim();
    if (trimmed === note.trim()) {
      setModalOpen(false);
      return;
    }
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const result = await updateCompanyAction(companyId, {
        note: trimmed || null,
      });
      setSaving(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote(trimmed);
      setModalOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <div style={CARD}>
        <div className="ord-note-header">
          <span className="pf-card-title">Anteckningar</span>
          <button
            type="button"
            className="ord-note-edit"
            onClick={openEdit}
            aria-label="Redigera anteckningar"
          >
            <EditorIcon name="edit" size={16} />
          </button>
        </div>
        <div className="ord-customer-note">
          {note || (
            <span className="ord-customer-note--empty">
              Inga anteckningar
            </span>
          )}
        </div>
      </div>

      {modalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => !saving && setModalOpen(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 24px 48px rgba(0,0,0,0.16)",
              width: 480,
              maxWidth: "90vw",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 20px",
                borderBottom: "1px solid var(--admin-border)",
                background: "#FAFAFA",
              }}
            >
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "var(--admin-text)",
                }}
              >
                Redigera anteckningar
              </span>
              <button
                type="button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  border: "none",
                  borderRadius: 6,
                  background: "none",
                  color: "var(--admin-text-tertiary)",
                  cursor: "pointer",
                }}
                onClick={() => !saving && setModalOpen(false)}
                aria-label="Stäng"
              >
                <EditorIcon name="close" size={18} />
              </button>
            </div>
            <div style={{ padding: 20 }}>
              <textarea
                style={{
                  width: "100%",
                  border: "1px solid var(--admin-border)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: "var(--font-sm)",
                  fontFamily: "inherit",
                  fontWeight: 400,
                  color: "var(--admin-text)",
                  background: "#fff",
                  resize: "vertical",
                  lineHeight: 1.5,
                  minHeight: 100,
                  outline: "none",
                }}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Skriv en anteckning..."
                rows={4}
                maxLength={1000}
                autoFocus
              />
              <div
                style={{
                  fontSize: 12,
                  color: "#616161",
                  marginTop: 0,
                  lineHeight: 1.4,
                }}
              >
                Använd Tidslinjen istället om du vill kommentera eller
                nämna en personalmedlem.
              </div>
              {error && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "6px 10px",
                    background: "var(--admin-danger-tint, #fef2f2)",
                    color: "var(--admin-danger)",
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                  role="alert"
                >
                  {error}
                </div>
              )}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 8,
                padding: "12px 20px",
                borderTop: "1px solid var(--admin-border)",
              }}
            >
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                style={{ padding: "5px 10px", borderRadius: 8 }}
                onClick={() => !saving && setModalOpen(false)}
                disabled={saving}
              >
                Avbryt
              </button>
              <button
                type="button"
                className={`admin-btn ${draft.trim() !== (note ?? "") ? "admin-btn--accent" : ""}`}
                style={{ padding: "5px 10px", borderRadius: 8 }}
                disabled={draft.trim() === (note ?? "") || saving}
                onClick={saveNote}
              >
                {saving ? "Sparar..." : "Spara"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
