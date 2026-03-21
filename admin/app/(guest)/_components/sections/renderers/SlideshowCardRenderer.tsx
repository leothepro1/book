"use client";

/**
 * Slideshow Card Renderer (Bildspel: Infällt)
 * ────────────────────────────────────────────
 * Horizontal slider with card-style slides.
 * Each slide: image on top → heading → text → button below.
 * Dot pagination, drag/swipe, scroll-snap.
 */

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import type { SectionRendererProps, ResolvedBlock } from "@/app/_lib/sections/types";
import { ElementRenderer } from "../elements";
import "./slideshow-card-renderer.css";

export function SlideshowCardRenderer(props: SectionRendererProps) {
  const { section, presetSettings, blocks } = props;

  const imageAspectRatio = (presetSettings.imageAspectRatio as string) || "4 / 3";

  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startScrollLeft = useRef(0);
  const rafId = useRef(0);

  if (blocks.length === 0) return null;

  // ── Scroll helpers ──

  const getCenterScrollLeft = useCallback((index: number) => {
    const track = trackRef.current;
    const el = itemRefs.current[index];
    if (!track || !el) return 0;
    const trackRect = track.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    return track.scrollLeft + (elRect.left + elRect.width / 2) - (trackRect.left + trackRect.width / 2);
  }, []);

  const findClosest = useCallback(() => {
    const track = trackRef.current;
    if (!track) return 0;
    const trackRect = track.getBoundingClientRect();
    const center = trackRect.left + trackRect.width / 2;

    let closestIdx = 0;
    let closestDist = Infinity;

    itemRefs.current.forEach((el, i) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.left + rect.width / 2 - center);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    });

    return closestIdx;
  }, []);

  const scrollToSlide = useCallback(
    (index: number) => {
      const track = trackRef.current;
      if (!track) return;
      track.scrollTo({ left: getCenterScrollLeft(index), behavior: "smooth" });
      setActive(index);
    },
    [getCenterScrollLeft],
  );

  // ── Scroll tracking ──

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        setActive(findClosest());
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId.current);
    };
  }, [findClosest]);

  // ── Initial position ──

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollLeft = getCenterScrollLeft(0);
  }, [getCenterScrollLeft]);

  // ── Drag/Swipe ──

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startScrollLeft.current = trackRef.current?.scrollLeft ?? 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || !trackRef.current) return;
    trackRef.current.scrollLeft = startScrollLeft.current - (e.clientX - startX.current);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return (
    <section
      className="s-sc"
      data-section-id={section.id}
    >
      {/* Slide track */}
      <div
        ref={trackRef}
        className="s-sc__track"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {blocks.map((block, i) => (
          <CardSlide
            key={block.block.id}
            block={block}
            imageAspectRatio={imageAspectRatio}
            isActive={i === active}
            onClick={() => scrollToSlide(i)}
            itemRef={(el) => { itemRefs.current[i] = el; }}
          />
        ))}
      </div>

      {/* Dot indicators — same pattern as slider section */}
      {blocks.length > 1 && (
        <div className="s-sc__dots">
          {blocks.map((block, i) => (
            <button
              key={block.block.id}
              type="button"
              className={`s-sc__dot${i === active ? " s-sc__dot--active" : ""}`}
              onClick={() => scrollToSlide(i)}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Card Slide Component ─────────────────────────────────

function CardSlide({
  block,
  imageAspectRatio,
  isActive,
  onClick,
  itemRef,
}: {
  block: ResolvedBlock;
  imageAspectRatio: string;
  isActive: boolean;
  onClick: () => void;
  itemRef: (el: HTMLDivElement | null) => void;
}) {
  const imageSlot = block.slots.image;
  const contentSlot = block.slots.content;
  const actionsSlot = block.slots.actions;

  return (
    <div
      ref={itemRef}
      className={`s-sc__slide${isActive ? " s-sc__slide--active" : ""}`}
      onClick={!isActive ? onClick : undefined}
    >
      {/* Image — top of card, respects section aspect ratio */}
      {imageSlot?.elements.map((resolved) => (
        <div
          key={resolved.element.id}
          className="s-sc__image"
          style={{ aspectRatio: imageAspectRatio }}
        >
          <ElementRenderer resolved={resolved} />
        </div>
      ))}

      {/* Content — heading + text + button stacked below image */}
      <div className="s-sc__body">
        {contentSlot?.elements.map((resolved) => (
          <ElementRenderer key={resolved.element.id} resolved={resolved} />
        ))}
        {actionsSlot?.elements.map((resolved) => (
          <ElementRenderer key={resolved.element.id} resolved={resolved} />
        ))}
      </div>
    </div>
  );
}
