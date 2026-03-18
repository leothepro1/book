"use client";

/**
 * Color Scheme Select — Universal Dropdown
 * ─────────────────────────────────────────
 * Instance-level dropdown for selecting a color scheme.
 * Used by sections, header, and footer detail panels.
 *
 * Features:
 *   - Full scheme preview swatch (background + Aa + buttons)
 *   - "Redigera" link on active item → navigates to scheme editor
 *   - Footer with link to settings panel color accordion
 */

import { useState, useRef, useEffect } from "react";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { schemeLabel } from "./SettingsPanel";
import { useEditor } from "../EditorContext";
import { useDropDirection } from "../hooks/useDropDirection";
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
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dir = useDropDirection(triggerRef, open);
  const { navigateToSettings } = useEditor();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const selected = schemes.find((s) => s.id === value) ?? schemes[0];
  const selectedLabel = selected ? schemeLabel(selected) : "Inget schema";

  const handleEditLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    navigateToSettings("colors");
  };

  return (
    <div className="cs-select">
      <span className="cs-select__label">Färgschema</span>
      <div className="sf-dropdown" ref={ref}>
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
        {open && (
          <div className={`sf-dropdown__menu cs-dropdown${dir === "up" ? " sf-dropdown__menu--up" : ""}`}>
            <ul className="cs-dropdown__list">
              {schemes.map((scheme) => {
                const isActive = scheme.id === value;
                return (
                  <li
                    key={scheme.id}
                    className={`sf-dropdown__item cs-dropdown__item${isActive ? " sf-dropdown__item--active" : ""}`}
                    onClick={() => {
                      onChange(scheme.id);
                      setOpen(false);
                    }}
                  >
                    <SchemeMiniPreview scheme={scheme} />
                    <span className="cs-dropdown__content">
                      <span className="cs-dropdown__name">{schemeLabel(scheme)}</span>
                      {isActive && (
                        <span
                          className="cs-dropdown__edit"
                          onClick={handleEditLink}
                        >
                          Redigera
                        </span>
                      )}
                    </span>
                    <span
                      className={`material-symbols-rounded sf-dropdown__check${isActive ? " sf-dropdown__check--visible" : ""}`}
                    >
                      check
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="cs-dropdown__footer">
              <span className="cs-dropdown__footer-text">
                Gå till dina{" "}
                <button type="button" className="cs-dropdown__link" onClick={handleEditLink}>
                  temainställningar
                </button>
                {" "}för färg för att{" "}
                <button type="button" className="cs-dropdown__link" onClick={handleEditLink}>
                  redigera
                </button>
                {" "}alla temats färger.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
