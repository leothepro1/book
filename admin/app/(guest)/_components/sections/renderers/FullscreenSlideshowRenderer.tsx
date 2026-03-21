"use client";

/**
 * Fullscreen Slideshow Renderer
 * ─────────────────────────────
 * Full-width image slides with centered text overlay.
 * Dot pagination, drag/swipe support, optional auto-play.
 *
 * Each slide:
 *   ┌──────────────────────────────────┐
 *   │        (background image)        │
 *   │     ┌──────────────────────┐     │
 *   │     │     Rubrik (H2)      │     │
 *   │     │   Brödtext centrerad │     │
 *   │     │     [ Boka nu ]      │     │
 *   │     └──────────────────────┘     │
 *   └──────────────────────────────────┘
 *   ●  ●  ━━  ●
 */

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import type { SectionRendererProps, ResolvedBlock } from "@/app/_lib/sections/types";
import { ElementRenderer } from "../elements";
import "./fullscreen-slideshow-renderer.css";

export function FullscreenSlideshowRenderer(props: SectionRendererProps) {
  const { section, presetSettings, blocks } = props;

  const aspectRatio = (presetSettings.aspectRatio as string) || "16 / 9";
  const autoPlay = (presetSettings.autoPlay as boolean) ?? false;
  const autoPlayInterval = ((presetSettings.autoPlayInterval as number) ?? 5) * 1000;

  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startScrollLeft = useRef(0);
  const rafId = useRef(0);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // ── Auto-play ──

  useEffect(() => {
    if (!autoPlay || blocks.length <= 1) return;

    autoPlayRef.current = setInterval(() => {
      setActive((prev) => {
        const next = (prev + 1) % blocks.length;
        scrollToSlide(next);
        return next;
      });
    }, autoPlayInterval);

    return () => {
      if (autoPlayRef.current) clearInterval(autoPlayRef.current);
    };
  }, [autoPlay, autoPlayInterval, blocks.length, scrollToSlide]);

  // Reset auto-play on user interaction
  const resetAutoPlay = useCallback(() => {
    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
      autoPlayRef.current = null;
    }
  }, []);

  // ── Drag/Swipe ──

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startScrollLeft.current = trackRef.current?.scrollLeft ?? 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resetAutoPlay();
  }, [resetAutoPlay]);

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
      className="s-fss"
      data-section-id={section.id}
    >
      {/* Slide track */}
      <div
        ref={trackRef}
        className="s-fss__track"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {blocks.map((block, i) => (
          <Slide
            key={block.block.id}
            block={block}
            aspectRatio={aspectRatio}
            isActive={i === active}
            onClick={() => { resetAutoPlay(); scrollToSlide(i); }}
            itemRef={(el) => { itemRefs.current[i] = el; }}
          />
        ))}
      </div>

      {/* Dot indicators */}
      {blocks.length > 1 && (
        <div className="s-fss__dots">
          {blocks.map((block, i) => (
            <button
              key={block.block.id}
              type="button"
              className={`s-fss__dot${i === active ? " s-fss__dot--active" : ""}`}
              onClick={() => { resetAutoPlay(); scrollToSlide(i); }}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Slide Component ──────────────────────────────────────

function Slide({
  block,
  aspectRatio,
  isActive,
  onClick,
  itemRef,
}: {
  block: ResolvedBlock;
  aspectRatio: string;
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
      className={`s-fss__slide${isActive ? " s-fss__slide--active" : ""}`}
      style={{ aspectRatio }}
      onClick={!isActive ? onClick : undefined}
    >
      {/* Background image — fills the entire slide */}
      {imageSlot?.elements.map((resolved) => (
        <div key={resolved.element.id} className="s-fss__bg">
          <ElementRenderer resolved={resolved} />
        </div>
      ))}


      {/* Content — vertically stacked, centered */}
      <div className="s-fss__content">
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
