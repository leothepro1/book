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
                className="img-upload-replace-btn"
                onClick={() => inputRef.current?.click()}
              >
                Ersätt fil
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
          <path d="M18.22 20.75H5.78A2.64 2.64 0 0 1 3.25 18v-3a.75.75 0 1 1 1.5 0v3a1.16 1.16 0 0 0 1 1.25h12.47a1.16 1.16 0 0 0 1-1.25v-3a.75.75 0 1 1 1.5 0v3a2.64 2.64 0 0 1-2.5 2.75M16 8.75a.74.74 0 0 1-.53-.22L12 5.06 8.53 8.53a.75.75 0 0 1-1.06-1.06l4-4a.75.75 0 0 1 1.06 0l4 4A.75.75 0 0 1 16 8.75" fill="currentColor"/>
          <path d="M12 15.75a.76.76 0 0 1-.75-.75V4a.75.75 0 1 1 1.5 0v11a.76.76 0 0 1-.75.75" fill="currentColor"/>
        </svg>
        <button
          type="button"
          className="img-upload-cta-btn"
          onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
          disabled={isUploading}
        >
          {isUploading ? "Laddar upp..." : placeholder}
        </button>
        <span className="img-upload-empty-sub">eller, dra och släpp här</span>
      </div>
      {error && <p className="img-upload-error">{error}</p>}
    </div>
  );
}
