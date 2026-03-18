"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { SUPPORTED_LOCALES, getFlagUrl } from "@/app/_lib/translations/locales";
import "@/app/(admin)/settings/users/users.css";
import { configChannel } from "@/app/_lib/translations/config-channel";
import { scanTranslatableStrings } from "@/app/_lib/translations/scanner";
import type { StoredTranslation, TranslationNamespace } from "@/app/_lib/translations/types";
import {
  getLocales,
  addLocale,
  toggleLocalePublished,
  deleteLocale,
  getTranslationPanel,
  saveTranslation,
  deleteTranslation,
  setPrimaryLocale,
} from "./actions";
import type { LocaleRecord, TranslationFieldData, TranslationPanelResponse } from "./actions";

type LanguagesContentProps = {
  onSubTitleChange?: (title: string | null) => void;
  triggerAdd?: number;
};

// ── Locale info helpers ──────────────────────────────────────

function getLocaleInfo(code: string) {
  return SUPPORTED_LOCALES.find((l) => l.code === code);
}

// ── Main Content ─────────────────────────────────────────────

export function LanguagesContent({ onSubTitleChange, triggerAdd }: LanguagesContentProps) {
  const [locales, setLocales] = useState<LocaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    if (triggerAdd && triggerAdd > 0) setShowAddModal(true);
  }, [triggerAdd]);

  useEffect(() => {
    getLocales().then((data) => {
      setLocales(data);
      setLoading(false);
    });
  }, []);

  function handleOpenTranslation(localeCode: string) {
    window.location.href = `/translations/${localeCode}`;
  }

  if (loading) {
    return (
      <div>
        <div className="skel skel--text" style={{ width: 180, height: 16, marginBottom: 8 }} />
        <div className="skel" style={{ width: "100%", height: 64, borderRadius: 10, marginBottom: 8 }} />
        <div className="skel" style={{ width: "100%", height: 64, borderRadius: 10 }} />
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: 0 }}>
        {/* Table */}
        <div style={{ borderRadius: 10, overflow: "hidden" }}>
          {/* Table header */}
          <div style={{
            display: "flex", alignItems: "center",
            padding: "8px 16px",
            height: 43,
            background: "var(--admin-surface-hover)",
            borderBottom: "1px solid var(--admin-border)",
            fontSize: 14, fontWeight: 450,
            color: "var(--admin-text-secondary)",
          }}>
            <span style={{ width: 240, flexShrink: 0, display: "flex", alignItems: "center", gap: 16, minWidth: 0, paddingLeft: 12 }}>Språk</span>
            <span style={{ width: 130, flexShrink: 0 }}>Status</span>
            <span style={{ marginLeft: "auto", width: 200, textAlign: "right" }} />
          </div>

          {/* Rows */}
          {locales.map((locale) => (
            <LocaleRow
              key={locale.id}
              locale={locale}
              onTogglePublished={async (published) => {
                await toggleLocalePublished(locale.locale, published);
                setLocales((prev) => prev.map((l) => l.locale === locale.locale ? { ...l, published } : l));
              }}
              onDelete={async () => {
                await deleteLocale(locale.locale);
                setLocales((prev) => prev.filter((l) => l.locale !== locale.locale));
              }}
              onTranslate={() => handleOpenTranslation(locale.locale)}
              onSetPrimary={async () => {
                const result = await setPrimaryLocale(locale.locale);
                if (result.ok) {
                  setLocales((prev) => prev.map((l) => ({ ...l, primary: l.locale === locale.locale, published: l.locale === locale.locale ? true : l.published })));
                }
              }}
            />
          ))}

          {locales.length === 0 && (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--admin-text-secondary)", fontSize: 14 }}>
              Inga språk tillagda
            </div>
          )}
        </div>

      </div>

      {showAddModal && (
        <AddLocaleModal
          existingLocales={locales.map((l) => l.locale)}
          onClose={() => setShowAddModal(false)}
          onAdded={(newLocale) => {
            setLocales((prev) => [...prev, newLocale]);
            setShowAddModal(false);
          }}
        />
      )}
    </>
  );
}

// ── Locale Row ───────────────────────────────────────────────

function LocaleRow({
  locale,
  onTogglePublished,
  onDelete,
  onTranslate,
  onSetPrimary,
}: {
  locale: LocaleRecord;
  onTogglePublished: (published: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
  onTranslate: () => void;
  onSetPrimary: () => Promise<void>;
}) {
  const info = getLocaleInfo(locale.locale);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Close menu on click outside
  useEffect(() => {
    if (!showMenu) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showMenu]);

  // Build preview URL dynamically from current host + locale
  function openPreview() {
    const host = window.location.origin;
    // For non-primary locales, prefix with locale code
    const previewUrl = locale.primary
      ? `${host}/p/test`
      : `${host}/${locale.locale}/p/test`;
    window.open(previewUrl, "_blank");
    setShowMenu(false);
  }

  return (
    <>
      <div
        className=""
        style={{
          display: "flex", alignItems: "center",
          padding: "10px 16px",
          borderBottom: "1px solid var(--admin-border)",
        }}
      >
        {/* Language name */}
        <span style={{ width: 240, flexShrink: 0, display: "flex", alignItems: "center", minWidth: 0, paddingLeft: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 450, color: "var(--admin-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {info?.name ?? locale.locale}
            </div>
            {locale.primary && (
              <div style={{ fontSize: 12, color: "var(--admin-text-secondary)", marginTop: 1 }}>
                Standard
              </div>
            )}
          </div>
        </span>

        {/* Status */}
        <span style={{ width: 130, flexShrink: 0 }}>
          {locale.published ? (
            <span className="users-status users-status--active">Publicerad</span>
          ) : (
            <span className="users-status users-status--pending">Opublicerad</span>
          )}
        </span>

        {/* Actions */}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {!locale.primary && (
            <button
              className="users-actions-btn"
              onClick={(e) => { e.stopPropagation(); onTranslate(); }}
            >
              Översätt
            </button>
          )}

          {/* More menu */}
          {!locale.primary && (
            <div style={{ position: "relative" }}>
              <button
                ref={btnRef}
                onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                style={{
                  border: "none", background: "none", cursor: "pointer",
                  color: "var(--admin-text-secondary)", display: "flex", alignItems: "center",
                  padding: 4, borderRadius: 6,
                }}
              >
                <EditorIcon name="more_horiz" size={20} />
              </button>

              {showMenu && createPortal(
                <div
                  ref={menuRef}
                  className="sf-dropdown__menu"
                  style={{
                    position: "fixed",
                    top: btnRef.current ? btnRef.current.getBoundingClientRect().bottom + 4 : 0,
                    left: btnRef.current ? btnRef.current.getBoundingClientRect().right - 180 : 0,
                    width: 180,
                    zIndex: 300,
                  }}
                >
                  {/* Publish / Unpublish */}
                  {locale.published ? (
                    <div
                      className="sf-dropdown__item"
                      onClick={() => { setShowMenu(false); setShowUnpublishConfirm(true); }}
                    >
                      <span style={{ flex: 1 }}>Avpublicera</span>
                    </div>
                  ) : (
                    <div
                      className="sf-dropdown__item"
                      onClick={async () => { setShowMenu(false); await onTogglePublished(true); }}
                    >
                      <span style={{ flex: 1 }}>Publicera</span>
                    </div>
                  )}

                  {/* Preview */}
                  <div
                    className="sf-dropdown__item"
                    onClick={openPreview}
                  >
                    <span style={{ flex: 1 }}>Förhandsgranska</span>
                  </div>

                  {/* Set as default */}
                  <div
                    className="sf-dropdown__item"
                    onClick={async () => { setShowMenu(false); await onSetPrimary(); }}
                  >
                    <span style={{ flex: 1 }}>Ange som standard</span>
                  </div>

                  {/* Delete */}
                  <div
                    className="sf-dropdown__item"
                    style={{ color: "#C62828" }}
                    onClick={() => { setShowMenu(false); setShowDeleteConfirm(true); }}
                  >
                    <span style={{ flex: 1 }}>Ta bort</span>
                  </div>
                </div>,
                document.body,
              )}
            </div>
          )}
        </span>
      </div>

      {/* Unpublish confirmation modal */}
      {showUnpublishConfirm && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowUnpublishConfirm(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
          <div
            style={{
              position: "relative", zIndex: 1, background: "var(--admin-surface)",
              borderRadius: 16, padding: 24, width: 380,
              animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
              Avpublicera {info?.name ?? locale.locale}?
            </h3>
            <p style={{ fontSize: 14, color: "#616161", lineHeight: 1.6, marginBottom: 20 }}>
              Gäster kommer inte längre kunna se portalen på detta språk. Befintliga översättningar behålls.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="settings-btn--outline" onClick={() => setShowUnpublishConfirm(false)}>
                Avbryt
              </button>
              <button
                className="settings-btn--danger-solid"
                onClick={async () => {
                  await onTogglePublished(false);
                  setShowUnpublishConfirm(false);
                }}
              >
                Avpublicera
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
          <div
            style={{
              position: "relative", zIndex: 1, background: "var(--admin-surface)",
              borderRadius: 16, padding: 24, width: 380,
              animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
              Ta bort {info?.name ?? locale.locale}?
            </h3>
            <p style={{ fontSize: 14, color: "#616161", lineHeight: 1.6, marginBottom: 20 }}>
              Alla översättningar för detta språk tas bort permanent.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="settings-btn--outline" onClick={() => setShowDeleteConfirm(false)}>
                Avbryt
              </button>
              <button
                className="settings-btn--danger-solid"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  await onDelete();
                  setShowDeleteConfirm(false);
                }}
              >
                Ta bort
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Add Locale Modal ─────────────────────────────────────────

function AddLocaleModal({
  existingLocales,
  onClose,
  onAdded,
}: {
  existingLocales: string[];
  onClose: () => void;
  onAdded: (locale: LocaleRecord) => void;
}) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  const existingSet = new Set(existingLocales);
  const available = SUPPORTED_LOCALES.filter(
    (l) => !existingSet.has(l.code) && l.name.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleAdd(code: string) {
    setAdding(true);
    const result = await addLocale(code);
    setAdding(false);
    if (result.ok && result.locale) {
      onAdded(result.locale);
    }
  }

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div style={{ position: "absolute", inset: 0, background: "var(--admin-overlay)", animation: "settings-modal-fade-in 0.15s ease" }} />
      <div
        style={{
          position: "relative", zIndex: 1, background: "var(--admin-surface)",
          borderRadius: 16, width: 420, maxHeight: "85vh", display: "flex", flexDirection: "column",
          animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "#F9F8F7", borderBottom: "1px solid #E6E5E3",
          padding: "20px 20px 12px 20px", borderRadius: "16px 16px 0 0",
        }}>
          <h3 style={{ fontSize: 17, fontWeight: 600 }}>Lägg till språk</h3>
          <button
            onClick={onClose}
            style={{ display: "flex", border: "none", background: "transparent", cursor: "pointer", color: "var(--admin-text-secondary)" }}
            aria-label="Stäng"
          >
            <EditorIcon name="close" size={20} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 20px 0" }}>
          <div style={{ position: "relative" }}>
            <EditorIcon name="search" size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--admin-text-secondary)" }} />
            <input
              type="text"
              placeholder="Sök språk..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="admin-float-input"
              style={{ width: "100%", padding: "8px 12px 8px 32px", fontSize: 13 }}
              autoFocus
            />
          </div>
        </div>

        {/* Locale list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px 20px" }}>
          {available.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--admin-text-secondary)", padding: "12px 0" }}>
              Inga fler språk tillgängliga.
            </p>
          )}
          {available.map((locale) => (
            <button
              key={locale.code}
              disabled={adding}
              onClick={() => handleAdd(locale.code)}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%",
                padding: "10px 8px", border: "none", background: "none",
                cursor: "pointer", borderRadius: 10, fontSize: 14, color: "var(--admin-text)",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#F1F0EF"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
            >
              <img
                src={getFlagUrl(locale.country, 40)}
                alt={locale.name}
                style={{ width: 22, height: 16, objectFit: "cover", borderRadius: 2, flexShrink: 0 }}
              />
              <span style={{ flex: 1, textAlign: "left" }}>{locale.name}</span>
              <span style={{ fontSize: 12, color: "var(--admin-text-secondary)" }}>{locale.code.toUpperCase()}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Helpers for live mirroring ────────────────────────────────

function buildExistingMap(fields: TranslationFieldData[], locale: string): Map<string, StoredTranslation> {
  const map = new Map<string, StoredTranslation>();
  for (const f of fields) {
    if (f.translatedValue !== undefined) {
      map.set(`${locale}:${f.resourceId}`, {
        id: "",
        tenantId: "",
        locale,
        resourceId: f.resourceId,
        namespace: f.namespace as TranslationNamespace,
        value: f.translatedValue,
        sourceDigest: f.translationDigest ?? "",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
  return map;
}

function computeStats(fields: TranslationFieldData[]) {
  return {
    total: fields.length,
    translated: fields.filter((f) => f.status === "TRANSLATED").length,
    outdated: fields.filter((f) => f.status === "OUTDATED").length,
    missing: fields.filter((f) => f.status === "MISSING").length,
  };
}

// ── Translation Panel ────────────────────────────────────────

function TranslationPanel({
  locale,
  onBack,
}: {
  locale: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<TranslationPanelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingFieldsRef = useRef<Set<string>>(new Set());
  const dataRef = useRef<TranslationPanelResponse | null>(null);

  useEffect(() => { dataRef.current = data; }, [data]);

  useEffect(() => {
    getTranslationPanel(locale).then((result) => {
      setData(result);
      setLoading(false);
    });
  }, [locale]);

  // Subscribe to live config changes from PreviewContext via configChannel
  // Single stable subscription per locale — reads dataRef, not data
  useEffect(() => {
    return configChannel.subscribe((newConfig) => {
      if (!dataRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const currentData = dataRef.current;
        if (!currentData) return;
        const existingMap = buildExistingMap(currentData.fields, locale);
        const updatedFields = scanTranslatableStrings(newConfig, existingMap, locale);

        setData((prev) => {
          if (!prev) return prev;
          const prevMap = new Map(prev.fields.map((f) => [f.resourceId, f]));
          const editing = editingFieldsRef.current;

          const merged: TranslationFieldData[] = updatedFields.map((f) => {
            const prevField = prevMap.get(f.resourceId);

            // Preserve unsaved edits for fields currently being edited
            if (prevField && editing.has(f.resourceId)) {
              return {
                ...f,
                resourceId: f.resourceId,
                namespace: f.namespace,
                sourceValue: f.sourceValue,
                sourceDigest: f.sourceDigest,
                translatedValue: prevField.translatedValue,
                translationDigest: prevField.translationDigest,
                status: f.sourceDigest !== (prevField.translationDigest ?? "") ? "OUTDATED" : f.status,
                fieldLabel: f.context.fieldLabel,
                pageId: f.context.pageId,
                pageName: f.context.pageName,
                sectionId: f.context.sectionId,
                sectionName: f.context.sectionName,
              };
            }

            return {
              resourceId: f.resourceId,
              namespace: f.namespace,
              sourceValue: f.sourceValue,
              sourceDigest: f.sourceDigest,
              translatedValue: prevField?.translatedValue ?? f.translatedValue,
              translationDigest: prevField?.translationDigest ?? f.translationDigest,
              status: f.status,
              fieldLabel: f.context.fieldLabel,
              pageId: f.context.pageId,
              pageName: f.context.pageName,
              sectionId: f.context.sectionId,
              sectionName: f.context.sectionName,
            };
          });

          return { ...prev, fields: merged, stats: computeStats(merged) };
        });
      }, 300);
    });
  }, [locale]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (loading || !data) {
    return (
      <div>
        <div className="skel skel--text" style={{ width: 200, height: 16, marginBottom: 16 }} />
        <div className="skel" style={{ width: "100%", height: 48, borderRadius: 10, marginBottom: 8 }} />
        <div className="skel" style={{ width: "100%", height: 48, borderRadius: 10, marginBottom: 8 }} />
        <div className="skel" style={{ width: "100%", height: 48, borderRadius: 10 }} />
      </div>
    );
  }

  // Group fields by page → section
  const pages = new Map<string, { pageName: string; sections: Map<string, { sectionName: string; fields: TranslationFieldData[] }> }>();
  for (const field of data.fields) {
    if (!field.pageId) continue;
    if (!pages.has(field.pageId)) {
      pages.set(field.pageId, { pageName: field.pageName ?? field.pageId, sections: new Map() });
    }
    const page = pages.get(field.pageId)!;
    const secId = field.sectionId ?? "_ungrouped";
    if (!page.sections.has(secId)) {
      page.sections.set(secId, { sectionName: field.sectionName ?? secId, fields: [] });
    }
    page.sections.get(secId)!.fields.push(field);
  }

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          border: "none", background: "none", cursor: "pointer",
          color: "var(--admin-text-secondary)", fontSize: 13, fontWeight: 500,
          padding: 0, marginBottom: 16,
        }}
      >
        <EditorIcon name="arrow_back" size={16} />
        Tillbaka till språk
      </button>

      {/* Stats bar */}
      <div style={{
        display: "flex", gap: 16, marginBottom: 24, fontSize: 13, color: "var(--admin-text-secondary)",
      }}>
        <span>{data.stats.total} fält totalt</span>
        <span style={{ color: "#1a7f37" }}>{data.stats.translated} översatta</span>
        {data.stats.outdated > 0 && (
          <span style={{ color: "#9a6700" }}>{data.stats.outdated} föråldrade</span>
        )}
        {data.stats.missing > 0 && (
          <span style={{ color: "#616161" }}>{data.stats.missing} saknas</span>
        )}
      </div>

      {/* Fields grouped by page → section */}
      {Array.from(pages.entries()).map(([pageId, page]) => (
        <div key={pageId} style={{ marginBottom: 32 }}>
          <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--admin-text)", marginBottom: 12 }}>
            {page.pageName}
          </h4>

          {Array.from(page.sections.entries()).map(([secId, section]) => (
            <div key={secId} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--admin-text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {section.sectionName}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {section.fields.map((field) => (
                  <TranslationField
                    key={field.resourceId}
                    field={field}
                    locale={locale}
                    onEditingChange={(editing) => {
                      if (editing) editingFieldsRef.current.add(field.resourceId);
                      else editingFieldsRef.current.delete(field.resourceId);
                    }}
                    onSaved={(resourceId, value, newDigest) => {
                      setData((prev) => {
                        if (!prev) return prev;
                        const updated = prev.fields.map((f) =>
                          f.resourceId === resourceId
                            ? { ...f, translatedValue: value, translationDigest: newDigest, status: "TRANSLATED" as const }
                            : f,
                        );
                        return {
                          ...prev,
                          fields: updated,
                          stats: {
                            total: updated.length,
                            translated: updated.filter((f) => f.status === "TRANSLATED").length,
                            outdated: updated.filter((f) => f.status === "OUTDATED").length,
                            missing: updated.filter((f) => f.status === "MISSING").length,
                          },
                        };
                      });
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      {data.fields.length === 0 && (
        <p style={{ fontSize: 14, color: "var(--admin-text-secondary)" }}>
          Inga översättningsbara fält hittades i konfigurationen.
        </p>
      )}
    </div>
  );
}

// ── Translation Field ────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  TRANSLATED: "#1a7f37",
  OUTDATED: "#9a6700",
  MISSING: "#b0b0b0",
};

function TranslationField({
  field,
  locale,
  onSaved,
  onEditingChange,
}: {
  field: TranslationFieldData;
  locale: string;
  onSaved: (resourceId: string, value: string, newDigest: string) => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [value, setValue] = useState(field.translatedValue ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictSource, setConflictSource] = useState<string | null>(null);

  // Sync value when field data changes from mirror update (only if not editing)
  const isEditingRef = useRef(false);
  useEffect(() => {
    if (!isEditingRef.current) {
      setValue(field.translatedValue ?? "");
    }
  }, [field.translatedValue]);

  const isMultiline = field.sourceValue.length > 80 || field.sourceValue.includes("\n");

  function handleFocus() {
    isEditingRef.current = true;
    onEditingChange?.(true);
  }

  async function handleBlur() {
    isEditingRef.current = false;
    onEditingChange?.(false);

    // Don't save if value hasn't changed
    if (value === (field.translatedValue ?? "")) return;

    setSaving(true);
    setError(null);
    setConflictSource(null);

    // Empty value with existing translation → delete translation
    if (value.trim() === "") {
      if (field.translatedValue) {
        const result = await deleteTranslation(locale, field.resourceId);
        setSaving(false);
        if (result.ok) {
          onSaved(field.resourceId, "", "");
        } else {
          setError(result.error ?? "Kunde inte ta bort");
        }
      } else {
        setSaving(false);
      }
      return;
    }

    const result = await saveTranslation(locale, field.resourceId, value, field.sourceDigest);
    setSaving(false);

    if (result.ok) {
      onSaved(field.resourceId, value, field.sourceDigest);
    } else if (result.conflict) {
      setError("Källtexten har ändrats — uppdatera översättningen");
      setConflictSource(result.conflict.currentSource);
    } else {
      setError(result.error ?? "Kunde inte spara");
    }
  }

  const InputComponent = isMultiline ? "textarea" : "input";

  return (
    <div style={{
      border: "1px solid var(--admin-border)",
      borderRadius: 10,
      overflow: "hidden",
    }}>
      {/* Header: field label + status dot */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px",
        background: "#FAFAF9",
        borderBottom: "1px solid var(--admin-border)",
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: STATUS_COLORS[field.status] ?? STATUS_COLORS.MISSING,
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--admin-text-secondary)" }}>
          {field.fieldLabel}
        </span>
        {saving && (
          <span style={{ fontSize: 11, color: "var(--admin-text-secondary)", marginLeft: "auto" }}>Sparar...</span>
        )}
      </div>

      {/* Outdated warning */}
      {field.status === "OUTDATED" && (
        <div style={{
          padding: "8px 12px", fontSize: 12, lineHeight: 1.5,
          background: "rgb(255, 244, 212)", color: "#9a6700",
          borderBottom: "1px solid var(--admin-border)",
        }}>
          <strong>Källtexten har ändrats.</strong> Kontrollera och uppdatera översättningen.
        </div>
      )}

      {/* Two-column: source + translation */}
      <div style={{ display: "flex" }}>
        {/* Source (primary locale) */}
        <div style={{ flex: 1, padding: "10px 12px", borderRight: "1px solid var(--admin-border)", background: "#FAFAF9" }}>
          <div style={{ fontSize: 11, color: "var(--admin-text-secondary)", marginBottom: 4, fontWeight: 500 }}>SV</div>
          {isMultiline ? (
            <div style={{ fontSize: 13, color: "var(--admin-text)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {conflictSource ?? field.sourceValue}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--admin-text)" }}>
              {conflictSource ?? field.sourceValue}
            </div>
          )}
        </div>

        {/* Translation input */}
        <div style={{ flex: 1, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "var(--admin-text-secondary)", marginBottom: 4, fontWeight: 500 }}>
            {locale.toUpperCase()}
          </div>
          <InputComponent
            value={value}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValue(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="Lägg till översättning"
            style={{
              width: "100%",
              border: "none",
              background: "none",
              fontSize: 13,
              color: "var(--admin-text)",
              resize: "none",
              outline: "none",
              padding: 0,
              fontFamily: "inherit",
              lineHeight: 1.6,
              ...(isMultiline ? { minHeight: 60 } : {}),
            }}
            {...(isMultiline ? { rows: 3 } : {})}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: "8px 12px", fontSize: 12, color: "#C62828",
          background: "#FBE9E7", borderTop: "1px solid var(--admin-border)",
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
