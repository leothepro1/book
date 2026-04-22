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
  /**
   * Hover-overlay label shown over an uploaded image (default: "Ändra").
   * Callers that want a longer phrase like "Ändra bild" override this.
   */
  overlayLabel?: string;
  /**
   * Whether to render the filename badge over the uploaded image
   * (default: true). Some surfaces — e.g. the social-share preview
   * card — show the image as a pure visual and don't want the
   * filename overlaying it.
   */
  showFilename?: boolean;
  /**
   * Fixed height for the image slot. Applied to both the empty-state
   * picker and the uploaded-result card. When set, overrides the
   * default 16:10 aspect-ratio sizing so the image box always
   * occupies the same vertical space regardless of upload state.
   *
   * Accepts any valid CSS length (px number auto-converted to `"Xpx"`).
   */
  height?: number | string;
};

export function ImageUpload({
  value,
  onChange,
  onRemove,
  folder = "cards",
  shape = "square",
  placeholder = "Välj fil...",
  variant = "default",
  accept = "image/jpeg,image/png,image/webp,image/avif",
  overlayLabel = "Ändra",
  showFilename = true,
  height,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // When a fixed height is requested, override both the default
  // aspect-ratio (img-upload-result) and the min-height
  // (img-upload-empty) via inline style so the image slot is exactly
  // the requested size in both states.
  const fixedHeightStyle: React.CSSProperties | undefined =
    height !== undefined
      ? { height, minHeight: height, aspectRatio: "auto" }
      : undefined;
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
        <div
          className="img-upload-result"
          onClick={() => !isUploading && inputRef.current?.click()}
          style={fixedHeightStyle}
        >
          {isUploading && !displayUrl ? (
            <div className="img-upload-skeleton" />
          ) : (
            <img src={displayUrl!} alt="" className="img-upload-result-img" />
          )}
          {isUploading && displayUrl && (
            <div className="img-upload-skeleton img-upload-skeleton--overlay" />
          )}
          {isUploading && (
            <div className="img-upload-result-progress">
              <div className="img-upload-progressbar" />
            </div>
          )}
          {showFilename && (
            <span className="img-upload-result-filename">
              {fileName ?? (value ? value.split("/").pop() : "bild")}
            </span>
          )}
          {!isUploading && (
            <div className="img-upload-result-overlay">
              <span className="img-upload-result-overlay-label">{overlayLabel}</span>
            </div>
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
        style={{
          cursor: isUploading ? "not-allowed" : "pointer",
          opacity: isUploading ? 0.7 : 1,
          ...fixedHeightStyle,
        }}
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
