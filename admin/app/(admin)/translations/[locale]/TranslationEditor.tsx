"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { RichTextEditor } from "@/app/_components/RichTextEditor";
import type { RichTextEditorHandle } from "@/app/_components/RichTextEditor";
import { MediaLibraryModal } from "@/app/(admin)/_components/MediaLibrary";
import { SUPPORTED_LOCALES, getFlagUrl } from "@/app/_lib/translations/locales";
import {
  getTranslationPanel,
  getLocales,
  saveTranslation,
  deleteTranslation,
  hasTranslationDrafts,
  publishTranslations,
  getLocalePreviewUrl,
} from "@/app/(admin)/settings/languages/actions";
import type { LocaleRecord, TranslationFieldData, TranslationPanelResponse } from "@/app/(admin)/settings/languages/actions";
import { getResourceTypes } from "@/app/_lib/translations/resource-types";

function getLocaleInfo(code: string) {
  return SUPPORTED_LOCALES.find((l) => l.code === code);
}

// ── Sidebar page item ────────────────────────────────────────

interface SidebarPage {
  id: string;
  name: string;
  icon: string;
  fieldCount: number;
  translatedCount: number;
}

// ── Resource type definitions for dropdowns ──────────────────

const RESOURCE_TYPE_OPTIONS = [
  { id: "pages", label: "Sidor", icon: "article" },
  ...getResourceTypes().map((rt) => ({ id: rt.id, label: rt.label, icon: rt.icon })),
];

const PAGE_ICON_MAP: Record<string, string> = {
  home: "home",
  stays: "hotel",
  account: "person",
  "check-in": "door_open",
  "help-center": "help",
  support: "headset_mic",
};

// ── Main component ───────────────────────────────────────────

export function TranslationEditor({ locale: initialLocale }: { locale: string }) {
  const router = useRouter();
  const [locale, setLocale] = useState(initialLocale);
  const info = getLocaleInfo(locale);
  const [data, setData] = useState<TranslationPanelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [locales, setLocales] = useState<LocaleRecord[]>([]);
  const [activeResourceType, setActiveResourceType] = useState("pages");
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [hasDrafts, setHasDrafts] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLingeringAfterPublish, setIsLingeringAfterPublish] = useState(false);
  const [showLocalePicker, setShowLocalePicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const localePickerRef = useRef<HTMLDivElement>(null);
  const typePickerRef = useRef<HTMLDivElement>(null);
  const draftCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load locales + translation data — wait for all before releasing skeleton
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setActiveItem(null);

    Promise.all([
      getLocales(),
      getTranslationPanel(locale),
      hasTranslationDrafts(locale),
    ]).then(([localesResult, panelResult, draftsResult]) => {
      if (cancelled) return;
      setLocales(localesResult.filter((loc) => !loc.primary));
      setData(panelResult);
      setHasDrafts(draftsResult);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [locale]);

  // Debounced draft check
  const checkDrafts = useCallback(() => {
    if (draftCheckTimer.current) clearTimeout(draftCheckTimer.current);
    draftCheckTimer.current = setTimeout(() => {
      hasTranslationDrafts(locale).then(setHasDrafts);
    }, 500);
  }, [locale]);

  useEffect(() => {
    return () => { if (draftCheckTimer.current) clearTimeout(draftCheckTimer.current); };
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (localePickerRef.current && !localePickerRef.current.contains(e.target as Node)) setShowLocalePicker(false);
      if (typePickerRef.current && !typePickerRef.current.contains(e.target as Node)) setShowTypePicker(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Build items grouped by resource type → item → sections → fields
  const itemsByType = new Map<string, SidebarPage[]>();
  const itemFieldsMap = new Map<string, { name: string; sections: Map<string, { name: string; fields: TranslationFieldData[] }> }>();

  if (data) {
    // Map resourceId prefix → resource type id
    const resourceTypes = getResourceTypes();
    const pageIdToType = new Map<string, string>();

    for (const field of data.fields) {
      if (!field.pageId) continue;

      // Determine type from resourceId prefix
      if (!pageIdToType.has(field.pageId)) {
        let typeId = "pages";
        for (const rt of resourceTypes) {
          if (field.resourceId.startsWith(`tenant:${rt.resourceIdSegment}:`)) {
            typeId = rt.id;
            break;
          }
        }
        pageIdToType.set(field.pageId, typeId);
      }

      if (!itemFieldsMap.has(field.pageId)) {
        itemFieldsMap.set(field.pageId, { name: field.pageName ?? field.pageId, sections: new Map() });
      }
      const item = itemFieldsMap.get(field.pageId)!;
      const secId = field.sectionId ?? "_ungrouped";
      if (!item.sections.has(secId)) {
        item.sections.set(secId, { name: field.sectionName ?? secId, fields: [] });
      }
      item.sections.get(secId)!.fields.push(field);
    }

    // Build SidebarPage entries per type
    for (const [pageId, item] of itemFieldsMap) {
      const typeId = pageIdToType.get(pageId) ?? "pages";

      let fieldCount = 0;
      let translatedCount = 0;
      for (const section of item.sections.values()) {
        fieldCount += section.fields.length;
        translatedCount += section.fields.filter((f) => f.status === "TRANSLATED").length;
      }

      if (!itemsByType.has(typeId)) itemsByType.set(typeId, []);
      const existing = itemsByType.get(typeId)!;
      if (!existing.find((p) => p.id === pageId)) {
        existing.push({
          id: pageId,
          name: item.name,
          icon: PAGE_ICON_MAP[pageId] ?? "article",
          fieldCount,
          translatedCount,
        });
      }
    }
  }

  const sidebarItems = itemsByType.get(activeResourceType) ?? [];
  const currentItem = activeItem ?? sidebarItems[0]?.id ?? null;
  const currentItemData = currentItem ? itemFieldsMap.get(currentItem) : null;
  const currentItemName = sidebarItems.find((p) => p.id === currentItem)?.name ?? currentItem;
  const activeTypeLabel = RESOURCE_TYPE_OPTIONS.find((t) => t.id === activeResourceType)?.label ?? "Sidor";

  function handleSaved(resourceId: string, value: string, newDigest: string) {
    checkDrafts();
    setData((prev) => {
      if (!prev) return prev;
      const updated = prev.fields.map((f) =>
        f.resourceId === resourceId
          ? { ...f, translatedValue: value || undefined, translationDigest: value ? newDigest : undefined, status: (value ? "TRANSLATED" : "MISSING") as TranslationFieldData["status"] }
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
  }

  function handleLocaleChange(newLocale: string) {
    setShowLocalePicker(false);
    setLocale(newLocale);
    router.replace(`/translations/${newLocale}`);
  }

  return (
    <div className="tx">
      {/* ── Header ── */}
      <header className="tx-header">
        <div className="tx-header__nav">
          <button
            className="tx-header__back"
            onClick={() => router.push("/home")}
            aria-label="Tillbaka"
          >
            <EditorIcon name="logout" size={20} style={{ transform: "rotate(180deg)" }} />
          </button>
          <span className="tx-header__label">
            <span className="tx-header__label-text tx-header__label-text--default">Översätt</span>
            <span className="tx-header__label-text tx-header__label-text--hover">Avsluta</span>
          </span>
        </div>

        <div className="tx-header__spacer" />

        {/* Center dropdowns */}
        <div className="tx-header__center">

        {/* Language picker dropdown */}
        <div className="tx-header__dropdown" ref={localePickerRef}>
          <button
            className="tx-header__dropdown-trigger"
            onClick={() => { setShowLocalePicker(!showLocalePicker); setShowTypePicker(false); }}
          >
            <span>Översätter {info?.name?.toLowerCase() ?? locale}</span>
            <EditorIcon name="expand_more" size={20} />
          </button>
          {showLocalePicker && (
            <div className="tx-header__dropdown-menu">
              {locales.map((loc) => {
                const locInfo = getLocaleInfo(loc.locale);
                return (
                  <button
                    key={loc.locale}
                    className={`tx-header__dropdown-item ${loc.locale === locale ? "tx-header__dropdown-item--active" : ""}`}
                    onClick={() => handleLocaleChange(loc.locale)}
                  >
                    {locInfo && <img src={getFlagUrl(locInfo.country, 40)} alt={locInfo.name} style={{ width: 18, height: 13, objectFit: "cover", borderRadius: 2 }} />}
                    <span>{locInfo?.name ?? loc.locale}</span>
                    {loc.locale === locale && <EditorIcon name="check" size={18} style={{ color: "var(--admin-accent)", marginLeft: "auto" }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Resource type picker dropdown */}
        <div className="tx-header__dropdown" ref={typePickerRef}>
          <button
            className="tx-header__dropdown-trigger"
            onClick={() => { setShowTypePicker(!showTypePicker); setShowLocalePicker(false); }}
          >
            <span>{activeTypeLabel}</span>
            <EditorIcon name="expand_more" size={20} />
          </button>
          {showTypePicker && (
            <div className="tx-header__dropdown-menu">
              {RESOURCE_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className={`tx-header__dropdown-item ${opt.id === activeResourceType ? "tx-header__dropdown-item--active" : ""}`}
                  onClick={() => { setActiveResourceType(opt.id); setActiveItem(null); setShowTypePicker(false); }}
                >
                  <EditorIcon name={opt.icon} size={18} style={{ color: "var(--admin-text-secondary)" }} />
                  <span>{opt.label}</span>
                  {opt.id === activeResourceType && <EditorIcon name="check" size={18} style={{ color: "var(--admin-accent)", marginLeft: "auto" }} />}
                </button>
              ))}
            </div>
          )}
        </div>

        </div>
        {/* End center dropdowns */}

        <div className="tx-header__spacer" />

        <button
          className="tx-header__preview"
          onClick={async () => {
            const url = await getLocalePreviewUrl(locale);
            if (url) window.open(url, "_blank");
          }}
        >
          Visa
        </button>

        <button
          className={`tx-header__save ${hasDrafts && !isPublishing && !isLingeringAfterPublish ? "tx-header__save--active" : ""}`}
          disabled={!hasDrafts || isPublishing || isLingeringAfterPublish}
          onClick={async () => {
            setIsPublishing(true);
            const startTime = Date.now();
            const result = await publishTranslations(locale);
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, 2000 - elapsed);
            await new Promise((resolve) => setTimeout(resolve, remaining));
            setIsPublishing(false);
            if (result.ok) {
              setHasDrafts(false);
              setIsLingeringAfterPublish(true);
              setTimeout(() => setIsLingeringAfterPublish(false), 1000);
              getTranslationPanel(locale).then(setData);
            }
          }}
        >
          <SaveSpinner visible={isPublishing} />
          <span>{isLingeringAfterPublish ? "Sparad" : "Spara"}</span>
        </button>
      </header>

      {/* ── Body ── */}
      <div className="tx-body">
        {/* ── Sidebar ── */}
        <nav className="tx-sidebar">
          <div className="tx-sidebar__label">{activeTypeLabel}</div>
          {loading ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="tx-sidebar__item" style={{ pointerEvents: "none" }}>
                  <div className="skel skel--text" style={{ width: `${50 + (i % 3) * 20}%`, height: 14 }} />
                  <span className="tx-sidebar__item-count">
                    <div className="skel skel--text" style={{ width: 28, height: 12 }} />
                  </span>
                </div>
              ))}
            </>
          ) : sidebarItems.length > 0 ? (
            sidebarItems.map((item) => (
              <button
                key={item.id}
                className={`tx-sidebar__item ${currentItem === item.id ? "tx-sidebar__item--active" : ""}`}
                onClick={() => setActiveItem(item.id)}
              >
                <span>{item.name}</span>
                <span className="tx-sidebar__item-count">
                  {item.translatedCount}/{item.fieldCount}
                </span>
              </button>
            ))
          ) : (
            <div style={{ padding: "16px", fontSize: 13, color: "var(--admin-text-secondary)" }}>
              Inga {activeTypeLabel.toLowerCase()} att översätta
            </div>
          )}
        </nav>

        {/* ── Content ── */}
        <div className="tx-content">
          {loading ? (
            <>
              {/* Page title skeleton */}
              <div className="tx-content__page-title">
                <div className="skel skel--text" style={{ width: 140, height: 20 }} />
              </div>

              {/* Section card skeleton */}
              <div className="tx-content__fields">
                {/* Section label */}
                <div className="tx-content__section-label">
                  <div className="skel skel--text" style={{ width: 100, height: 16 }} />
                </div>
                {/* Column headers */}
                <div className="tx-field__column-headers">
                  <div className="tx-field__column-header-type" />
                  <div className="tx-field__column-header">
                    <div className="skel skel--text" style={{ width: 60, height: 14 }} />
                  </div>
                  <div className="tx-field__column-header">
                    <div className="skel skel--text" style={{ width: 50, height: 14 }} />
                  </div>
                </div>
                {/* Field rows */}
                {[1, 2, 3].map((i) => (
                  <div key={i} className="tx-field">
                    <div className="tx-field__columns">
                      <div className="tx-field__type">
                        <div className="skel skel--text" style={{ width: `${60 + (i % 3) * 15}%`, height: 14 }} />
                        <div className="skel skel--text" style={{ width: 80, height: 12, marginTop: 2 }} />
                      </div>
                      <div className="tx-field__source">
                        <div className="skel skel--text" style={{ width: `${50 + (i % 2) * 30}%`, height: 14 }} />
                      </div>
                      <div className="tx-field__target">
                        <div className="skel skel--text" style={{ width: `${40 + (i % 3) * 20}%`, height: 14 }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : currentItemData ? (
            <>
            <h2 className="tx-content__page-title">
              {currentItemName}
            </h2>
            {Array.from(currentItemData.sections.entries()).map(([secId, section]) => (
              <div key={secId} className="tx-content__fields">
                <div className="tx-content__section-label">{section.name}</div>
                <div className="tx-field__column-headers">
                  <div className="tx-field__column-header-type" />
                  <div className="tx-field__column-header">{data?.primaryLocaleName ?? "Referens"}</div>
                  <div className="tx-field__column-header">{info?.name ?? locale.toUpperCase()}</div>
                </div>
                {section.fields.map((field) => (
                  <TranslationFieldCard
                    key={field.resourceId}
                    field={field}
                    locale={locale}
                    primaryLocaleName={data?.primaryLocaleName ?? "Svenska"}
                    onSaved={handleSaved}
                  />
                ))}
              </div>
            ))}
            </>
          ) : (
            <div className="tx-empty">
              <EditorIcon name="translate" size={32} />
              <span className="tx-empty__text">Välj i sidopanelen</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Translation Field Card ───────────────────────────────────

// ── Save spinner — identical to editor PublishSpinner ─────────

function SaveSpinner({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [animState, setAnimState] = useState<"enter" | "exit" | "idle">("idle");
  const prevVisible = useRef(visible);

  useEffect(() => {
    if (visible && !prevVisible.current) {
      setMounted(true);
      setAnimState("enter");
    } else if (!visible && prevVisible.current) {
      setAnimState("exit");
    }
    prevVisible.current = visible;
  }, [visible]);

  const handleAnimationEnd = () => {
    if (animState === "exit") { setMounted(false); setAnimState("idle"); }
    else if (animState === "enter") { setAnimState("idle"); }
  };

  if (!mounted) return null;

  return (
    <svg
      className={`publish-spinner ${animState === "exit" ? "publish-spinner--out" : ""}`}
      width="18"
      height="18"
      viewBox="0 0 21 21"
      fill="none"
      onAnimationEnd={handleAnimationEnd}
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
    </svg>
  );
}

// ── Translation Field Card ───────────────────────────────────

function TranslationFieldCard({
  field,
  locale,
  primaryLocaleName,
  onSaved,
}: {
  field: TranslationFieldData;
  locale: string;
  primaryLocaleName: string;
  onSaved: (resourceId: string, value: string, newDigest: string) => void;
}) {
  const [value, setValue] = useState(field.translatedValue ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictSource, setConflictSource] = useState<string | null>(null);
  const isEditingRef = useRef(false);
  const richTextSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const editorHandleRef = useRef<RichTextEditorHandle | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!isEditingRef.current) {
      setValue(field.translatedValue ?? "");
    }
  }, [field.translatedValue]);

  const isMultiline = field.sourceValue.length > 80 || field.sourceValue.includes("\n");

  async function handleBlur() {
    isEditingRef.current = false;

    const currentValue = valueRef.current;
    if (currentValue === (field.translatedValue ?? "")) return;

    setSaving(true);
    setError(null);
    setConflictSource(null);

    if (currentValue.trim() === "") {
      if (field.translatedValue) {
        const result = await deleteTranslation(locale, field.resourceId);
        setSaving(false);
        if (result.ok) onSaved(field.resourceId, "", "");
        else setError(result.error ?? "Kunde inte ta bort");
      } else {
        setSaving(false);
      }
      return;
    }

    const result = await saveTranslation(locale, field.resourceId, currentValue, field.sourceDigest);
    setSaving(false);

    if (result.ok) {
      onSaved(field.resourceId, currentValue, field.sourceDigest);
    } else if (result.conflict) {
      setError("Källtexten har ändrats — uppdatera översättningen");
      setConflictSource(result.conflict.currentSource);
    } else {
      setError(result.error ?? "Kunde inte spara");
    }
  }

  // Detect richtext by checking for HTML tags in source
  const isRichText = /<[a-z][\s\S]*>/i.test(field.sourceValue);

  return (
    <div className="tx-field">
      {isRichText ? (
        // Richtext: same 3-column layout, target gets toolbar header + contentEditable
        <div className="tx-field__columns">
          <div className="tx-field__type">
            <span className="tx-field__type-label">{field.fieldLabel}</span>
            <span className="tx-field__type-source">Källa: {primaryLocaleName}</span>
          </div>
          <div className="tx-field__source tx-field__source--richtext">
            <RichTextEditor
              value={conflictSource ?? field.sourceValue}
              onChange={() => {}}
              placeholder=""
              minHeight={60}
            />
          </div>
          <div className="tx-field__target tx-field__target--richtext">
            <RichTextEditor
              value={value}
              onChange={(html) => {
                setValue(html);
                isEditingRef.current = true;
                if (richTextSaveTimer.current) clearTimeout(richTextSaveTimer.current);
                richTextSaveTimer.current = setTimeout(() => {
                  isEditingRef.current = false;
                  handleBlur();
                }, 1000);
              }}
              placeholder=""
              minHeight={60}
              showMediaPicker
              onRequestMediaPicker={() => setMediaOpen(true)}
              editorHandle={editorHandleRef}
            />
            <MediaLibraryModal
              open={mediaOpen}
              onClose={() => setMediaOpen(false)}
              onConfirm={async (asset) => {
                setMediaOpen(false);
                editorHandleRef.current?.insertImage(asset.url, asset.filename || "", asset.id);
                // Save immediately — read HTML directly from onChange which already fired
                // Wait a tick for React state to flush
                await new Promise((r) => setTimeout(r, 50));
                const currentHtml = valueRef.current;
                if (currentHtml && currentHtml !== (field.translatedValue ?? "")) {
                  await saveTranslation(locale, field.resourceId, currentHtml, field.sourceDigest);
                  onSaved(field.resourceId, currentHtml, field.sourceDigest);
                }
              }}
              title="Välj bild"
              accept="image"
            />
          </div>
        </div>
      ) : (
        // Plain text: 3-column layout
        <div className="tx-field__columns">
          <div className="tx-field__type">
            <span className="tx-field__type-label">{field.fieldLabel}</span>
            <span className="tx-field__type-source">Källa: {primaryLocaleName}</span>
          </div>

          <div className="tx-field__source">
            <div className="tx-field__source-text">
              {conflictSource ?? field.sourceValue}
            </div>
          </div>

          <div className="tx-field__target">
            <textarea
              className="tx-field__input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => { isEditingRef.current = true; }}
              onBlur={handleBlur}
              rows={1}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="tx-field__error">{error}</div>
      )}
    </div>
  );
}
