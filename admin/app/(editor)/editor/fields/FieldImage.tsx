"use client";

import { useState, useCallback } from "react";
import type { SettingField } from "@/app/(guest)/_lib/themes/types";
import { MediaLibraryModal } from "@/app/(admin)/_components/MediaLibrary";
import type { MediaLibraryResult } from "@/app/(admin)/_components/MediaLibrary";
import "@/app/(admin)/_components/ImageUpload/image-upload.css";
import { FieldWrapper } from "./FieldRenderer";

type Props = {
  field: SettingField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
};

export function FieldImage({ field, value, onChange }: Props) {
  const src = (value as string) || "";
  const [libraryOpen, setLibraryOpen] = useState(false);

  const handleLibraryConfirm = useCallback(
    (asset: MediaLibraryResult) => {
      onChange(field.key, asset.url);
      setLibraryOpen(false);
    },
    [field.key, onChange]
  );

  return (
    <FieldWrapper field={field}>
      {src ? (
        /* ── Has image ── */
        <div className="img-upload">
          <div className="img-upload-result">
            <div className="img-upload-result-thumb">
              <img src={src} alt="" className="img-upload-result-img" />
            </div>
            <div className="img-upload-result-meta">
              <span className="img-upload-result-filename">
                {src.split("/").pop() || "bild"}
              </span>
              <button
                type="button"
                className="design-logo-btn design-logo-btn-edit"
                onClick={() => setLibraryOpen(true)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z" /></svg>
                <span>Ändra</span>
              </button>
            </div>
            <button
              type="button"
              className="img-upload-trash-btn"
              onClick={() => onChange(field.key, "")}
              aria-label="Ta bort bild"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path fillRule="evenodd" d="m6.83 0-.35.15-1.33 1.33-.15.35V3H0v1h2v11.5l.5.5h11l.5-.5V4h2V3h-5V1.83l-.15-.35L9.52.15 9.17 0H6.83ZM10 3v-.96L8.96 1H7.04L6 2.04V3h4ZM5 4H3v11h10V4H5Zm2 3v5H6V7h1Zm3 .5V7H9v5h1V7.5Z" fill="currentColor"/>
              </svg>
            </button>
          </div>
        </div>
      ) : (
        /* ── Empty state — opens media library ── */
        <div className="img-upload">
          <div
            className="img-upload-empty"
            onClick={() => setLibraryOpen(true)}
            style={{ cursor: "pointer" }}
          >
            <svg className="img-upload-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M3.5 0 3 .5v23l.5.5h17l.5-.5v-16l-.15-.35-7-7L13.5 0h-10ZM4 23V1h9v6.5l.5.5H20v15H4ZM19.3 7 14 1.7V7h5.3Z" fill="currentColor" />
            </svg>
            <span className="img-upload-empty-text">
              Välj fil att ladda upp,<br />eller dra och släpp här
            </span>
          </div>
        </div>
      )}
      <MediaLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onConfirm={handleLibraryConfirm}
        currentValue={src}
        uploadFolder="sections"
        accept="image"
      />
    </FieldWrapper>
  );
}
