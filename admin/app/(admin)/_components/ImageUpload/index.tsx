"use client";
import { useRef, useCallback, useState } from "react";
import { useUpload } from "@/app/(admin)/_hooks/useUpload";
import "./image-upload.css";

type ImageUploadProps = {
  value?: string;
  onChange: (url: string, publicId: string) => void;
  onRemove?: () => void;
  folder?: string;
  shape?: "square" | "wide";
  placeholder?: string;
  variant?: "default" | "compact";
  /** File accept attribute (default: images only) */
  accept?: string;
};

export function ImageUpload({
  value,
  onChange,
  onRemove,
  folder = "hospitality/cards",
  shape = "square",
  placeholder = "Välj fil...",
  variant = "default",
  accept = "image/jpeg,image/png,image/webp,image/avif",
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading, error } = useUpload(folder);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const displayUrl = previewUrl ?? value;

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    await upload(
      file,
      (localUrl) => setPreviewUrl(localUrl),
      (result) => {
        setPreviewUrl(null);
        onChange(result.url, result.publicId);
      },
    );
  }, [upload, onChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    handleFile(file);
  }, [handleFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleRemove = useCallback(() => {
    setPreviewUrl(null);
    setFileName(null);
    onRemove?.();
  }, [onRemove]);

  // ── Uploaded / uploading state ──
  if (displayUrl || isUploading) {
    return (
      <div className="img-upload">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          style={{ display: "none" }}
        />
        <div className="img-upload-result">
          {/* Thumbnail container */}
          <div className="img-upload-result-thumb">
            {isUploading && !displayUrl ? (
              <div className="img-upload-skeleton" />
            ) : (
              <img src={displayUrl!} alt="" className="img-upload-result-img" />
            )}
            {isUploading && displayUrl && (
              <div className="img-upload-skeleton img-upload-skeleton--overlay" />
            )}
          </div>

          {/* Meta column */}
          <div className="img-upload-result-meta">
            <span className="img-upload-result-filename">
              {fileName ?? (value ? value.split("/").pop() : "bild")}
            </span>
            {isUploading ? (
              <div className="img-upload-progressbar" />
            ) : (
              <button
                type="button"
                className="design-logo-btn design-logo-btn-edit"
                onClick={() => inputRef.current?.click()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z" /></svg>
                <span>Ändra</span>
              </button>
            )}
          </div>

          {/* Trash — only when done */}
          {!isUploading && (
            <button
              type="button"
              className="img-upload-trash-btn"
              onClick={handleRemove}
              aria-label="Ta bort bild"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path fillRule="evenodd" d="m6.83 0-.35.15-1.33 1.33-.15.35V3H0v1h2v11.5l.5.5h11l.5-.5V4h2V3h-5V1.83l-.15-.35L9.52.15 9.17 0H6.83ZM10 3v-.96L8.96 1H7.04L6 2.04V3h4ZM5 4H3v11h10V4H5Zm2 3v5H6V7h1Zm3 .5V7H9v5h1V7.5Z" fill="currentColor"/>
              </svg>
            </button>
          )}
        </div>
        {error && <p className="img-upload-error">{error}</p>}
      </div>
    );
  }

  // ── Empty state ──
  if (variant === "compact") {
    return (
      <div className="img-upload">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          style={{ display: "none" }}
        />
        <button
          type="button"
          className="img-upload-cta-btn"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? "Laddar upp..." : placeholder}
        </button>
        {error && <p className="img-upload-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="img-upload">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        style={{ display: "none" }}
      />
      <div
        className={"img-upload-empty" + (isDragging ? " img-upload-empty--drag" : "")}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isUploading && inputRef.current?.click()}
        style={{ cursor: isUploading ? "not-allowed" : "pointer", opacity: isUploading ? 0.7 : 1 }}
      >
        <svg className="img-upload-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path fillRule="evenodd" d="M3.5 0 3 .5v23l.5.5h17l.5-.5v-16l-.15-.35-7-7L13.5 0h-10ZM4 23V1h9v6.5l.5.5H20v15H4ZM19.3 7 14 1.7V7h5.3Z" fill="currentColor" />
        </svg>
        <span className="img-upload-empty-text">
          {isUploading ? "Laddar upp..." : (<>Välj fil att ladda upp,<br />eller dra och släpp här</>)}
        </span>
      </div>
      {error && <p className="img-upload-error">{error}</p>}
    </div>
  );
}
