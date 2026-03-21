"use client";

/**
 * Color Scheme Select — Popup Picker
 * ───────────────────────────────────
 * Instance-level popup for selecting a color scheme.
 * Used by sections, header, and footer detail panels.
 *
 * Opens as a fixed popup (same pattern as layout picker / menu picker).
 * Positioned relative to trigger — above or below based on viewport space.
 *
 * Features:
 *   - Full scheme preview swatch (background + Aa + buttons)
 *   - "Redigera" link on active item → navigates to scheme editor
 *   - Footer with link to settings panel color accordion
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { schemeLabel } from "./SettingsPanel";
import { useEditor } from "../EditorContext";
import type { ColorScheme } from "@/app/_lib/color-schemes";

/** Mini scheme preview — shows background, "Aa" text, and button miniatures. */
function SchemeMiniPreview({ scheme, size }: { scheme: ColorScheme; size?: "trigger" | "item" }) {
  const t = scheme.tokens;
  return (
    <span
      className={`cs-mini${size === "trigger" ? " cs-mini--trigger" : ""}`}
      style={{ background: t.background }}
    >
      <span className="cs-mini__text" style={{ color: t.text }}>
        Aa
      </span>
      <span className="cs-mini__buttons">
        <span
          className="cs-mini__btn-solid"
          style={{ background: t.solidButtonBackground }}
        />
        <span
          className="cs-mini__btn-outline"
          style={{ borderColor: t.outlineButton }}
        />
      </span>
    </span>
  );
}

export function ColorSchemeSelect({
  schemes,
  value,
  onChange,
}: {
  schemes: ColorScheme[];
  value: string | undefined;
  onChange: (schemeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupPos, setPopupPos] = useState<{ top?: number; bottom?: number }>({});
  const { navigateToSettings } = useEditor();

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const popupHeight = 320;

    if (spaceBelow >= popupHeight + 16) {
      setPopupPos({ top: rect.top });
    } else {
      setPopupPos({ bottom: window.innerHeight - rect.bottom });
    }
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handle = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open, updatePosition]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open]);

  const selected = schemes.find((s) => s.id === value) ?? schemes[0];
  const selectedLabel = selected ? schemeLabel(selected) : "Ingen palett";

  const handleEditLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    navigateToSettings("colors");
  };

  return (
    <div className="cs-select">
      <span className="cs-select__label">Färgpalett</span>
      <button
        ref={triggerRef}
        type="button"
        className="cs-select__trigger"
        onClick={() => setOpen(!open)}
      >
        {selected && <SchemeMiniPreview scheme={selected} size="trigger" />}
        <span className="sf-dropdown__text">{selectedLabel}</span>
        <EditorIcon name="expand_more" size={16} className="sf-dropdown__chevron" />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popupRef}
          className="cs-popup"
          style={popupPos}
        >
          <ul className="cs-popup__list">
            {schemes.map((scheme) => {
              const isActive = scheme.id === value;
              return (
                <li key={scheme.id}>
                  <button
                    type="button"
                    className={`cs-popup__item${isActive ? " cs-popup__item--active" : ""}`}
                    onClick={() => {
                      onChange(scheme.id);
                      setOpen(false);
                    }}
                  >
                    {isActive && (
                      <span className="material-symbols-rounded sf-dropdown__check sf-dropdown__check--visible">
                        check
                      </span>
                    )}
                    <SchemeMiniPreview scheme={scheme} />
                    <span className="cs-popup__content">
                      <span className="cs-popup__name">{schemeLabel(scheme)}</span>
                      {isActive && (
                        <span
                          className="cs-popup__edit"
                          onClick={handleEditLink}
                        >
                          Redigera
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="cs-popup__footer">
            <span className="cs-popup__footer-text">
              Gå till dina{" "}
              <button type="button" className="cs-popup__link" onClick={handleEditLink}>
                temainställningar
              </button>
              {" "}för att{" "}
              <button type="button" className="cs-popup__link" onClick={handleEditLink}>
                redigera
              </button>
              {" "}alla temats färger.
            </span>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
