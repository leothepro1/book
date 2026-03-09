"use client";

import { useCallback, useRef, useState, useEffect, useLayoutEffect } from "react";

type Slide = {
  id: string;
  image: string;
  title: string;
  cta: string;
  href: string;
};

const ITEM_WIDTH_FRAC = 0.85;
const GAP = 0;
const SCALE_MIN = 0.85;
const SCALE_MAX = 1;

export function PebbleSliderClient({
  slides,
  gradientColor,
}: {
  slides: Slide[];
  gradientColor: string;
}) {
  const startIndex = Math.floor(slides.length / 2);
  const [active, setActive] = useState(startIndex);
  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startScrollLeft = useRef(0);
  const rafId = useRef(0);

  // Pixel-perfect centering via getBoundingClientRect
  const getCenterScrollLeft = useCallback((index: number) => {
    const track = trackRef.current;
    const el = itemRefs.current[index];
    if (!track || !el) return 0;
    const trackRect = track.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const trackCenter = trackRect.left + trackRect.width / 2;
    const elCenter = elRect.left + elRect.width / 2;
    return track.scrollLeft + (elCenter - trackCenter);
  }, []);

  // Update scale of every item based on distance from viewport center
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
      const norm = Math.min(dist / (elRect.width + GAP), 1);
      const scale = SCALE_MAX - norm * (SCALE_MAX - SCALE_MIN);
      el.style.transform = `scale(${scale})`;

      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    });

    return closestIdx;
  }, []);

  // Scroll handler
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

  // Initial center on mount
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

  // Drag
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
    <>
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
        {/* Left spacer — allows first item to be centered */}
        <div style={{ flex: "0 0 7.5%" }} aria-hidden />

        {slides.map((slide, i) => (
          <div
            key={slide.id}
            ref={(el) => { itemRefs.current[i] = el; }}
            onClick={() => { if (i !== active) scrollToSlide(i); }}
            style={{
              flex: `0 0 ${ITEM_WIDTH_FRAC * 100}%`,
              aspectRatio: "5 / 3",
              borderRadius: 16,
              overflow: "hidden",
              position: "relative",
              transformOrigin: "center center",
              transform: `scale(${i === startIndex ? SCALE_MAX : SCALE_MIN})`,
              cursor: i === active ? "default" : "pointer",
              willChange: "transform",
            }}
          >
            <img
              src={slide.image}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(90deg, ${gradientColor}e6 0%, ${gradientColor}aa 35%, ${gradientColor}40 60%, transparent 80%)`,
              }}
            />
            <div
              style={{
                position: "relative",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: "0 24px",
                gap: 17,
              }}
            >
              <div
                style={{
                  color: "#fff",
                  fontSize: 18,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  fontFamily: "var(--font-heading)",
                  maxWidth: 190,
                }}
              >
                {slide.title}
              </div>
              <a
                href={slide.href}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "8px 15px",
                  borderRadius: "var(--button-radius, 8px)",
                  background: "rgba(255, 255, 255, 0.85)",
                  color: "#222",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  fontFamily: "var(--font-button, var(--font-body))",
                  textDecoration: "none",
                  width: "fit-content",
                  backdropFilter: "blur(4px)",
                  WebkitBackdropFilter: "blur(4px)",
                }}
              >
                {slide.cta}
              </a>
            </div>
          </div>
        ))}

        {/* Right spacer — allows last item to be centered */}
        <div style={{ flex: "0 0 7.5%" }} aria-hidden />
      </div>

      {/* Dot indicators */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 17 }}>
        {slides.map((_, i) => (
          <button
            key={i}
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
    </>
  );
}
