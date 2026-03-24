"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { SUPPORTED_LOCALES, getFlagUrl } from "@/app/_lib/translations/locales";

export interface LanguagePanelProps {
  open: boolean;
  onClose: () => void;
  currentLocale: string;
  primaryLocale: string;
  publishedLocales: string[];
  showFlags: boolean;
  pathname: string;
}

export function LanguagePanel({
  open,
  onClose,
  currentLocale,
  primaryLocale,
  publishedLocales,
  showFlags,
  pathname,
}: LanguagePanelProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Drag-to-dismiss
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);
  const isDragging = useRef(false);

  const onDragStart = useCallback((clientY: number) => {
    isDragging.current = true;
    dragStartY.current = clientY;
    dragCurrentY.current = clientY;
    if (panelRef.current) {
      panelRef.current.style.transition = "none";
    }
  }, []);

  const onDragMove = useCallback((clientY: number) => {
    if (!isDragging.current || !panelRef.current) return;
    dragCurrentY.current = clientY;
    const delta = Math.max(0, clientY - dragStartY.current);
    panelRef.current.style.transform = `translateY(${delta}px)`;
  }, []);

  const onDragEnd = useCallback(() => {
    if (!isDragging.current || !panelRef.current) return;
    isDragging.current = false;
    const delta = dragCurrentY.current - dragStartY.current;
    panelRef.current.style.transition = "";
    panelRef.current.style.transform = "";
    if (delta > 80) {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const handleTouchMove = (e: TouchEvent) => onDragMove(e.touches[0].clientY);
    const handleTouchEnd = () => onDragEnd();
    const handleMouseMove = (e: MouseEvent) => onDragMove(e.clientY);
    const handleMouseUp = () => onDragEnd();

    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [open, onDragMove, onDragEnd]);

  // Sort: current locale first, then alphabetical by native name
  const sortedLocales = useMemo(() => {
    const locales = publishedLocales
      .map((code) => SUPPORTED_LOCALES.find((l) => l.code === code))
      .filter(Boolean) as (typeof SUPPORTED_LOCALES)[number][];

    return locales.sort((a, b) => {
      if (a.code === currentLocale) return -1;
      if (b.code === currentLocale) return 1;
      return a.nativeName.localeCompare(b.nativeName);
    });
  }, [publishedLocales, currentLocale]);

  const handleSelect = useCallback((localeCode: string) => {
    onClose();

    const strippedPath = pathname.replace(/^\/[a-z]{2}(\/(?:p|preview)\/)/, "$1");

    let newPath: string;
    if (localeCode === primaryLocale) {
      newPath = strippedPath;
    } else {
      newPath = `/${localeCode}${strippedPath}`;
    }

    window.location.href = newPath;
  }, [onClose, pathname, primaryLocale]);

  return (
    <>
      <div
        className={`lang-panel-overlay${open ? " lang-panel-overlay--open" : ""}`}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`lang-panel${open ? " lang-panel--open" : ""}`}
        role="dialog"
        aria-modal={open}
        aria-label="Välj språk"
      >
        <div
          className="lang-panel__handle"
          onTouchStart={(e) => onDragStart(e.touches[0].clientY)}
          onMouseDown={(e) => { e.preventDefault(); onDragStart(e.clientY); }}
          style={{ cursor: "grab", touchAction: "none" }}
        >
          <div className="lang-panel__handle-bar" />
        </div>
        <ul className="lang-panel__list">
          {sortedLocales.map((locale) => (
            <li key={locale.code}>
              <button
                type="button"
                className="lang-panel__item"
                onClick={() => handleSelect(locale.code)}
              >
                {showFlags && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getFlagUrl(locale.country, 48)}
                    alt=""
                    className="lang-panel__flag"
                    draggable={false}
                  />
                )}
                <span className="lang-panel__label">{locale.nativeName}</span>
                {locale.code === currentLocale && (
                  <span className="material-symbols-rounded lang-panel__check" aria-hidden="true">
                    check
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/**
 * Hook to manage language panel state with outside-click dismissal.
 */
export function useLanguagePanel() {
  const [langOpen, setLangOpen] = useState(false);
  const langAnchorRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const toggleLang = useCallback(() => setLangOpen((prev) => !prev), []);
  const closeLang = useCallback(() => setLangOpen(false), []);

  // Close on outside click (desktop)
  useEffect(() => {
    if (!langOpen) return;
    const handle = (e: MouseEvent) => {
      if (langAnchorRef.current && !langAnchorRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [langOpen]);

  // Close on navigation
  useEffect(() => { setLangOpen(false); }, [pathname]);

  return { langOpen, toggleLang, closeLang, langAnchorRef };
}
