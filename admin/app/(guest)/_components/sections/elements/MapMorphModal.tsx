"use client";

/**
 * MapMorphModal — Full-screen overlay for maps.
 *
 * No morph animation — opens and closes instantly on click.
 * The card (MapCanvas) stays untouched underneath.
 * Modal covers full screen with border-radius 0.
 * Title pill overlaid top-center, close button bottom-right.
 */

import { useState, useCallback, type ReactNode } from "react";

export function MapMorphModal({
  title,
  cardContent,
  modalContent,
}: {
  title: string;
  cardContent: ReactNode;
  modalContent: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <div onClick={handleOpen} style={{ cursor: "pointer" }}>
        {cardContent}
      </div>

      {open && (
        <>
          <div className="morph-modal-backdrop" style={{ opacity: 1 }} onClick={handleClose} />

          <div className="map-morph__modal">
            <div className="map-morph__canvas">
              {modalContent}
            </div>

            <div className="map-morph__title">
              <span>{title}</span>
            </div>

            <button
              type="button"
              className="map-morph__close"
              onClick={handleClose}
              aria-label="Stäng"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fill="currentColor" d="m13.63 3.12.37-.38-.74-.74-.38.37.75.75ZM2.37 12.89l-.37.37.74.74.38-.37-.75-.75Zm.75-10.52L2.74 2 2 2.74l.37.38.75-.75Zm9.76 11.26.38.37.74-.74-.37-.38-.75.75Zm0-11.26L2.38 12.9l.74.74 10.5-10.51-.74-.75Zm-10.5.75 10.5 10.5.75-.73L3.12 2.37l-.75.75Z" />
              </svg>
            </button>
          </div>
        </>
      )}
    </>
  );
}
