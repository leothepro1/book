"use client";

/**
 * Slider Section Renderers
 *
 * - SliderButtonRowRenderer: Horizontal scrollable row of buttons with icons.
 * - SliderCardRenderer: Centered carousel with image + title + CTA per slide,
 *   scale effect, gradient overlay, drag support, and dot indicators.
 *   All elements rendered via ElementRenderer (not hardcoded).
 */

import { useCallback, useRef, useState, useEffect, useLayoutEffect } from "react";
import type { SectionRendererProps, ResolvedBlock } from "@/app/_lib/sections/types";
import { ElementRenderer } from "../elements";

// ═══════════════════════════════════════════════════════════════
// PRESET: BUTTON ROW
// ═══════════════════════════════════════════════════════════════

export function SliderButtonRowRenderer(props: SectionRendererProps) {
  const { section, settings, presetSettings, blocks } = props;

  const padding = (settings.padding as number) ?? 16;
  const gap = (presetSettings.gap as number) ?? 8;

  if (blocks.length === 0) return null;

  return (
    <section
      data-section-id={section.id}
      style={{ padding, backgroundColor: "var(--background)" }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap,
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {blocks.map((block) => {
          const buttonElement = block.slots.content?.elements[0];
          if (!buttonElement) return null;
          return (
            <div key={block.block.id} data-block-id={block.block.id} style={{ flexShrink: 0 }}>
              <ElementRenderer resolved={buttonElement} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// PRESET: CARD (Pebble-style carousel)
// ═══════════════════════════════════════════════════════════════

const ITEM_WIDTH_FRAC = 0.85;
const SCALE_MIN = 0.85;
const SCALE_MAX = 1;

export function SliderCardRenderer(props: SectionRendererProps) {
  const { section, settings, presetSettings, blocks } = props;

  const padding = (settings.padding as number) ?? 16;
  const aspectRatio = (presetSettings.aspectRatio as string) || "5 / 3";
  const borderRadius = (presetSettings.borderRadius as number) ?? 16;

  const startIndex = Math.floor(blocks.length / 2);
  const [active, setActive] = useState(startIndex);
  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startScrollLeft = useRef(0);
  const rafId = useRef(0);

  if (blocks.length === 0) return null;

  const getCenterScrollLeft = useCallback((index: number) => {
    const track = trackRef.current;
    const el = itemRefs.current[index];
    if (!track || !el) return 0;
    const trackRect = track.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    return track.scrollLeft + (elRect.left + elRect.width / 2) - (trackRect.left + trackRect.width / 2);
  }, []);

  const updateScales = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const trackRect = track.getBoundingClientRect();
    const trackCenter = trackRect.left + trackRect.width / 2;

    let closestIdx = 0;
    let closestDist = Infinity;

    itemRefs.current.forEach((el, i) => {
      if (!el) return;
      const elRect = el.getBoundingClientRect();
      const elCenter = elRect.left + elRect.width / 2;
      const dist = Math.abs(elCenter - trackCenter);
      const norm = Math.min(dist / elRect.width, 1);
      const scale = SCALE_MAX - norm * (SCALE_MAX - SCALE_MIN);
      el.style.transform = `scale(${scale})`;

      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    });

    return closestIdx;
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        const closest = updateScales();
        if (closest !== undefined) setActive(closest);
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId.current);
    };
  }, [updateScales]);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollLeft = getCenterScrollLeft(startIndex);
    updateScales();
  }, [startIndex, getCenterScrollLeft, updateScales]);

  const scrollToSlide = useCallback(
    (index: number) => {
      const track = trackRef.current;
      if (!track) return;
      track.scrollLeft = getCenterScrollLeft(index);
      updateScales();
      setActive(index);
    },
    [getCenterScrollLeft, updateScales],
  );

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
      data-section-id={section.id}
      style={{ padding, backgroundColor: "var(--background)" }}
    >
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{
          display: "flex",
          gap: 0,
          overflowX: "auto",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
          cursor: "grab",
          userSelect: "none",
          margin: "0 -50px",
          padding: "0 40px",
        }}
      >
        {/* Left spacer */}
        <div style={{ flex: "0 0 7.5%" }} aria-hidden />

        {blocks.map((block, i) => (
          <CardSlide
            key={block.block.id}
            block={block}
            index={i}
            active={active}
            startIndex={startIndex}
            aspectRatio={aspectRatio}
            borderRadius={borderRadius}
            onClickInactive={() => scrollToSlide(i)}
            itemRef={(el) => { itemRefs.current[i] = el; }}
          />
        ))}

        {/* Right spacer */}
        <div style={{ flex: "0 0 7.5%" }} aria-hidden />
      </div>

      {/* Dot indicators */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 17 }}>
        {blocks.map((block, i) => (
          <button
            key={block.block.id}
            type="button"
            onClick={() => scrollToSlide(i)}
            style={{
              width: i === active ? 25 : 8,
              height: 8,
              borderRadius: 4,
              border: "none",
              background: "var(--text, #1a1a1a)",
              opacity: i === active ? 1 : 0.2,
              cursor: "pointer",
              padding: 0,
              transition: "width 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease",
            }}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
}

// ─── Card Slide ──────────────────────────────────────────────

function CardSlide({
  block,
  index,
  active,
  startIndex,
  aspectRatio,
  borderRadius,
  onClickInactive,
  itemRef,
}: {
  block: ResolvedBlock;
  index: number;
  active: number;
  startIndex: number;
  aspectRatio: string;
  borderRadius: number;
  onClickInactive: () => void;
  itemRef: (el: HTMLDivElement | null) => void;
}) {
  const imageEl = block.slots.image?.elements[0];
  const titleEl = block.slots.title?.elements[0];
  const actionEl = block.slots.action?.elements[0];

  return (
    <div
      ref={itemRef}
      onClick={() => { if (index !== active) onClickInactive(); }}
      data-block-id={block.block.id}
      style={{
        flex: `0 0 ${ITEM_WIDTH_FRAC * 100}%`,
        aspectRatio,
        borderRadius,
        overflow: "hidden",
        position: "relative",
        transformOrigin: "center center",
        transform: `scale(${index === startIndex ? SCALE_MAX : SCALE_MIN})`,
        cursor: index === active ? "default" : "pointer",
        willChange: "transform",
        background: "var(--background, #e0e0e0)",
      }}
    >
      {/* Background image — rendered via ElementRenderer, stretched to fill */}
      {imageEl && (
        <div style={{ position: "absolute", inset: 0 }}>
          <ElementRenderer resolved={imageEl} />
        </div>
      )}

      {/* Gradient overlay — static dark gradient for image readability */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(90deg, #000000e6 0%, #000000aa 35%, #00000040 60%, transparent 80%)",
          pointerEvents: "none",
        }}
      />

      {/* Content: title + button inherit scheme tokens via CSS cascading */}
      <div
        style={{
          position: "relative",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 24px",
          gap: 17,
          "--font-size-button": "14.5px",
          "--button-padding": "0.5rem 1rem",
        } as React.CSSProperties}
      >
        {titleEl && <ElementRenderer resolved={titleEl} />}
        {actionEl && <ElementRenderer resolved={actionEl} />}
      </div>
    </div>
  );
}
