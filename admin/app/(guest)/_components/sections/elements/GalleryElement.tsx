"use client";

import { useState, useCallback } from "react";
import type { ResolvedElement } from "@/app/_lib/sections/types";
import "./gallery-element.css";

type GalleryImage = {
  src: string;
  title: string;
  description: string;
};

function parseImages(value: unknown): GalleryImage[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => {
    if (typeof v === "string") return { src: v, title: "", description: "" };
    if (v && typeof v === "object" && typeof (v as GalleryImage).src === "string") return v as GalleryImage;
    return null;
  }).filter(Boolean) as GalleryImage[];
}

export function GalleryElement({ resolved }: { resolved: ResolvedElement }) {
  const { settings } = resolved;
  const images = parseImages(settings.images);
  const columns = parseInt((settings.columns as string) || "2", 10) || 2;
  const aspectRatio = (settings.aspectRatio as string) || "1/1";
  const title = (settings.title as string) || "";
  const radiusTopLeft = (settings.radiusTopLeft as number) ?? 16;
  const radiusTopRight = (settings.radiusTopRight as number) ?? 16;
  const radiusBottomRight = (settings.radiusBottomRight as number) ?? 16;
  const radiusBottomLeft = (settings.radiusBottomLeft as number) ?? 16;

  const borderRadius = `${radiusTopLeft}px ${radiusTopRight}px ${radiusBottomRight}px ${radiusBottomLeft}px`;

  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 250);
  }, []);

  const count = images.length;

  if (count === 0) {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "5 / 3",
          background: "#F1F0EE",
          borderRadius,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#999",
          fontSize: 14,
        }}
      >
        Inga bilder tillagda
      </div>
    );
  }

  return (
    <>
      {/* ── Mosaic preview ── */}
      <div className="s-gallery" onClick={() => setOpen(true)}>
        <div
          className="s-gallery__mosaic"
          style={{
            borderRadius,
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(2, count)}, 1fr)`,
            gap: 2,
          }}
        >
          {images.slice(0, 4).map((img, i) => (
            <div
              key={i}
              className="s-gallery__tile"
              style={{ backgroundImage: `url("${img.src}")`, aspectRatio: "4 / 3" }}
            />
          ))}
        </div>
        {title && <span className="s-gallery__title">{title}</span>}
        <span className="s-gallery__count">{count} {count === 1 ? "bild" : "bilder"}</span>
      </div>

      {/* ── Fullscreen modal ── */}
      {open && (
        <div className={"s-gallery-modal" + (closing ? " s-gallery-modal--closing" : "")}>
          <button
            type="button"
            className="s-gallery-modal__back"
            onClick={handleClose}
            aria-label="Tillbaka"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
              <path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z" />
            </svg>
          </button>
          <div className="s-gallery-modal__header">
            {title && <span className="s-gallery-modal__title">{title}</span>}
            <span className="s-gallery-modal__count">{count} {count === 1 ? "bild" : "bilder"}</span>
          </div>
          <div
            className="s-gallery-modal__grid"
            style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
          >
            {images.map((img, i) => (
              <div key={i} className="s-gallery-modal__item">
                <div
                  className="s-gallery-modal__img"
                  style={{ backgroundImage: `url("${img.src}")`, aspectRatio: aspectRatio.replace("/", " / ") }}
                />
                {(img.title || img.description) && (
                  <div className="s-gallery-modal__caption">
                    {img.title && <span className="s-gallery-modal__caption-title">{img.title}</span>}
                    {img.description && <span className="s-gallery-modal__caption-desc">{img.description}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
