"use client";

/**
 * Product Templates Management Page
 * ══════════════════════════════════
 *
 * Lists all ProductTemplates for the tenant.
 * Create new templates, edit in visual editor, delete.
 * Follows the collections page pattern.
 */

import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  listProductTemplates,
  createProductTemplate,
  deleteProductTemplate,
} from "@/app/_lib/products/template-actions";
import { templateSuffixToPageId } from "@/app/_lib/products/template";

type Template = {
  id: string;
  name: string;
  suffix: string;
  isDefault: boolean;
  createdAt: Date;
};

export default function ProductTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const data = await listProductTemplates();
    setTemplates(data);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Ta bort mallen "${name}"?`)) return;
    const result = await deleteProductTemplate(id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    refresh();
  };

  return (
    <div className="admin-page admin-page--no-preview products-page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>dashboard_customize</span>
            Produktmallar
          </h1>
          <div className="admin-actions">
            <button
              className="settings-btn--connect"
              style={{ fontSize: 13, padding: "5px 12px" }}
              onClick={() => { setModalOpen(true); setError(null); }}
            >
              Ny mall
            </button>
          </div>
        </div>

        <div className="admin-content">
          {error && (
            <div style={{ padding: "8px 12px", marginBottom: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 13, color: "#991b1b" }}>
              {error}
            </div>
          )}

          {/* Standard template — always editable, separate from alternate templates */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              marginBottom: 16,
              background: "var(--admin-surface)",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              border: "1px solid var(--admin-border)",
            }}
          >
            <span className="material-symbols-rounded" style={{ fontSize: 18, color: "var(--admin-text-tertiary)" }}>
              storefront
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, color: "var(--admin-text)" }}>Standardmall</div>
              <div style={{ fontSize: 12, color: "var(--admin-text-tertiary)", marginTop: 2 }}>
                shop-product
              </div>
            </div>
            <button
              className="admin-btn admin-btn--sm"
              onClick={() => router.push("/editor/shop-product")}
            >
              Redigera i editor
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--admin-text-tertiary)" }}>
              Laddar...
            </div>
          ) : templates.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--admin-text-tertiary)", fontSize: 13, lineHeight: 1.6 }}>
              <span className="material-symbols-rounded" style={{ fontSize: 32, display: "block", marginBottom: 8, opacity: 0.3 }}>dashboard_customize</span>
              Inga alternativa produktmallar skapade ännu.
              <br />
              Skapa en mall för att erbjuda olika produktsidlayouter.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {templates.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    background: "var(--admin-surface)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 13,
                  }}
                >
                  <span className="material-symbols-rounded" style={{ fontSize: 18, color: "var(--admin-text-tertiary)" }}>
                    {t.isDefault ? "star" : "description"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, color: "var(--admin-text)" }}>
                      {t.name}
                      {t.isDefault && (
                        <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 4, background: "var(--admin-accent)", color: "#fff" }}>
                          Standard
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--admin-text-tertiary)", marginTop: 2 }}>
                      {templateSuffixToPageId(t.suffix)}
                    </div>
                  </div>
                  <button
                    className="admin-btn admin-btn--sm"
                    onClick={() => router.push(`/editor/${templateSuffixToPageId(t.suffix)}`)}
                  >
                    Redigera i editor
                  </button>
                  <button
                    className="admin-btn admin-btn--sm admin-btn--danger-secondary"
                    onClick={() => handleDelete(t.id, t.name)}
                    disabled={t.isDefault}
                    title={t.isDefault ? "Standardmallen kan inte tas bort" : undefined}
                  >
                    Ta bort
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <CreateTemplateModal
          onClose={() => setModalOpen(false)}
          onCreated={() => { setModalOpen(false); refresh(); }}
          onError={setError}
        />
      )}
    </div>
  );
}

// ── Create Modal ────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[åäÅÄ]/g, "a")
    .replace(/[öÖ]/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function CreateTemplateModal({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [suffix, setSuffix] = useState("");
  const [suffixManual, setSuffixManual] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!suffixManual) setSuffix(slugify(val));
  };

  const handleSubmit = async () => {
    if (!name.trim() || !suffix.trim()) return;
    setSaving(true);
    const result = await createProductTemplate({ name: name.trim(), suffix: suffix.trim(), isDefault });
    setSaving(false);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onCreated();
  };

  return createPortal(
    <div
      className="am-overlay"
      onClick={onClose}
      style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        className="am-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 400, padding: 24 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Ny produktmall</h2>
          <button className="admin-btn admin-btn--ghost" onClick={onClose} style={{ padding: 4 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        <label className="admin-label--sm" style={{ display: "block", marginBottom: 6 }}>Namn</label>
        <input
          className="admin-input--sm"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="t.ex. Highlight"
          autoFocus
          style={{ width: "100%", marginBottom: 12 }}
        />

        <label className="admin-label--sm" style={{ display: "block", marginBottom: 6 }}>Suffix (URL-nyckel)</label>
        <input
          className="admin-input--sm"
          value={suffix}
          onChange={(e) => { setSuffix(e.target.value); setSuffixManual(true); }}
          placeholder="t.ex. highlight"
          style={{ width: "100%", marginBottom: 4, fontFamily: "var(--sf-mono, monospace)" }}
        />
        <div style={{ fontSize: 11, color: "var(--admin-text-tertiary)", marginBottom: 12 }}>
          Sidsökväg: shop-product.{suffix || "…"}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 20, cursor: "pointer" }}>
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Gör till standardmall
        </label>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="admin-btn admin-btn--outline" onClick={onClose}>Avbryt</button>
          <button
            className="settings-btn--connect"
            onClick={handleSubmit}
            disabled={saving || !name.trim() || !suffix.trim()}
            style={{ fontSize: 13, padding: "5px 16px" }}
          >
            {saving ? "Skapar..." : "Skapa mall"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
