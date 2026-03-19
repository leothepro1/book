"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { CheckinCardComponentProps } from "@/app/_lib/checkin-cards/types";
import { registerCardComponent } from "./registry";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "10", "20", "30", "40", "50"];

function EstimatedArrivalCard({ value, onChange, onValidChange, disabled, optional, checkInTime }: CheckinCardComponentProps & { checkInTime?: string }) {
  const defaultTime = checkInTime || "15:00";
  const [time, setTime] = useState<string>((value as string) || defaultTime);
  const [open, setOpen] = useState(false);
  const didInit = useRef(false);

  // Always valid — has a default
  useEffect(() => {
    onValidChange(true);
  }, [onValidChange]);

  // Set default value on mount only
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    if (!value) onChange(defaultTime);
  }, [value, onChange, defaultTime]);

  function handleSelect(h: string, m: string) {
    const val = `${h}:${m}`;
    setTime(val);
    onChange(val);
    setOpen(false);
  }

  const selectedHour = time ? time.split(":")[0] : null;
  const selectedMinute = time ? time.split(":")[1] : null;

  return (
    <div className="checkin-card">
      <div className="checkin-card__label-row">
        <span className="checkin-card__label">Beräknad ankomsttid</span>
        {optional && <span className="checkin-card__optional">Valfritt</span>}
      </div>
      <div className="checkin-card__body">
        <button
          type="button"
          className="eta-trigger eta-trigger--set"
          onClick={() => { if (!disabled) setOpen(true); }}
          disabled={disabled}
        >
          <span className="eta-trigger__text">{time}</span>
          <span className="material-symbols-rounded eta-trigger__chevron">expand_more</span>
        </button>
      </div>

      {open && typeof document !== "undefined" && createPortal(
        <TimeBottomSheet
          selectedHour={selectedHour}
          selectedMinute={selectedMinute}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
        />,
        document.body,
      )}
    </div>
  );
}

// ── Scroll Wheel Column ──────────────────────────────────────
// Custom physics-driven wheel — no native scroll.
// Touch/mouse drag controls offset, momentum + spring snap to items.

const ITEM_HEIGHT = 44;
const VISIBLE_COUNT = 5;
const CENTER_INDEX = Math.floor(VISIBLE_COUNT / 2);

function WheelColumn({
  items,
  selected,
  onSelect,
  label,
}: {
  items: string[];
  selected: string;
  onSelect: (val: string) => void;
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLDivElement | null)[]>([]);

  // Physics state (all in refs for rAF performance)
  const offset = useRef(0); // current scroll offset in px
  const velocity = useRef(0);
  const rafId = useRef(0);
  const dragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartOffset = useRef(0);
  const lastDragY = useRef(0);
  const lastDragTime = useRef(0);

  const maxOffset = (items.length - 1) * ITEM_HEIGHT;

  // Clamp offset to valid range
  const clamp = (v: number) => Math.max(0, Math.min(maxOffset, v));

  // Snap target for a given offset
  const snapIndex = (o: number) => Math.max(0, Math.min(items.length - 1, Math.round(o / ITEM_HEIGHT)));

  // Apply visual transforms based on current offset
  const render = useCallback(() => {
    const currentIdx = offset.current / ITEM_HEIGHT;

    for (let i = 0; i < items.length; i++) {
      const node = itemsRef.current[i];
      if (!node) continue;

      const distance = Math.abs(i - currentIdx);

      if (distance < 0.4) {
        node.style.transform = "none";
        node.style.opacity = "1";
        node.style.fontWeight = "600";
        node.style.fontSize = "22px";
      } else {
        const scale = Math.max(0.55, 1 - distance * 0.13);
        const opacity = Math.max(0.15, 1 - distance * 0.25);
        const rotateX = Math.min(55, distance * 22);
        const sign = i < currentIdx ? -1 : 1;
        node.style.transform = `perspective(300px) rotateX(${sign * rotateX}deg) scale(${scale})`;
        node.style.opacity = String(opacity);
        node.style.fontWeight = "400";
        node.style.fontSize = "20px";
      }

      // Position each item
      const y = i * ITEM_HEIGHT - offset.current + CENTER_INDEX * ITEM_HEIGHT;
      node.style.top = `${y}px`;
    }
  }, [items.length]);

  // Momentum + spring animation
  const animate = useCallback(() => {
    if (dragging.current) return;

    const target = snapIndex(offset.current) * ITEM_HEIGHT;
    const diff = target - offset.current;

    // If close enough and slow enough, snap and stop
    if (Math.abs(diff) < 0.5 && Math.abs(velocity.current) < 0.5) {
      offset.current = target;
      velocity.current = 0;
      render();
      onSelect(items[snapIndex(target)]);
      return;
    }

    // Apply friction to velocity
    velocity.current *= 0.88;

    // Spring force toward snap target (soft — gives a gentle bounce)
    const spring = diff * 0.1;
    velocity.current += spring;

    offset.current = clamp(offset.current + velocity.current);
    render();
    rafId.current = requestAnimationFrame(animate);
  }, [render, items, onSelect, maxOffset]);

  // Start animation loop when drag ends
  const startAnimation = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(animate);
  }, [animate]);

  // ── Drag handlers ──

  const handleDragStart = useCallback((clientY: number) => {
    cancelAnimationFrame(rafId.current);
    dragging.current = true;
    dragStartY.current = clientY;
    dragStartOffset.current = offset.current;
    lastDragY.current = clientY;
    lastDragTime.current = performance.now();
    velocity.current = 0;
  }, []);

  const handleDragMove = useCallback((clientY: number) => {
    if (!dragging.current) return;

    const now = performance.now();
    const dt = now - lastDragTime.current;

    const delta = dragStartY.current - clientY;
    const newOffset = clamp(dragStartOffset.current + delta);

    // Track velocity from last two points
    if (dt > 0) {
      velocity.current = (newOffset - offset.current) / Math.max(1, dt / 16);
    }

    offset.current = newOffset;
    lastDragY.current = clientY;
    lastDragTime.current = now;
    render();
  }, [render, maxOffset]);

  const handleDragEnd = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;

    // Cap velocity to prevent insane flicks
    velocity.current = Math.max(-30, Math.min(30, velocity.current));
    startAnimation();
  }, [startAnimation]);

  // ── Event listeners ──

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handleDragStart(e.clientY);
  }, [handleDragStart]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    handleDragMove(e.clientY);
  }, [handleDragMove]);

  const onPointerUp = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Scroll wheel support
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    cancelAnimationFrame(rafId.current);
    offset.current = clamp(offset.current + e.deltaY * 0.8);
    velocity.current = e.deltaY * 0.3;
    render();
    startAnimation();
  }, [render, startAnimation, maxOffset]);

  // Click to select — uses same physics engine for consistent bounce
  const handleClick = useCallback((idx: number) => {
    cancelAnimationFrame(rafId.current);
    const target = idx * ITEM_HEIGHT;
    const dist = target - offset.current;
    // Give it an initial kick toward target, then let animate() handle spring+friction
    velocity.current = dist * 0.3;
    dragging.current = false;
    startAnimation();
  }, [startAnimation]);

  // Initial position
  useEffect(() => {
    const idx = items.indexOf(selected);
    offset.current = Math.max(0, idx) * ITEM_HEIGHT;
    render();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup
  useEffect(() => {
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  return (
    <div className="eta-wheel">
      <div className="eta-wheel__label">{label}</div>
      <div
        ref={containerRef}
        className="eta-wheel__viewport"
        style={{ height: ITEM_HEIGHT * VISIBLE_COUNT, touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <div className="eta-wheel__highlight" style={{ top: CENTER_INDEX * ITEM_HEIGHT, height: ITEM_HEIGHT }} />
        <div className="eta-wheel__mask eta-wheel__mask--top" style={{ height: CENTER_INDEX * ITEM_HEIGHT }} />
        <div className="eta-wheel__mask eta-wheel__mask--bottom" style={{ height: CENTER_INDEX * ITEM_HEIGHT }} />
        {items.map((item, i) => (
          <div
            key={item}
            ref={(el) => { itemsRef.current[i] = el; }}
            className="eta-wheel__item"
            style={{ height: ITEM_HEIGHT, position: "absolute", left: 0, right: 0 }}
            onClick={() => handleClick(i)}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Time Bottom Sheet ────────────────────────────────────────

function TimeBottomSheet({
  selectedHour,
  selectedMinute,
  onSelect,
  onClose,
}: {
  selectedHour: string | null;
  selectedMinute: string | null;
  onSelect: (h: string, m: string) => void;
  onClose: () => void;
}) {
  const [hour, setHour] = useState(selectedHour ?? "14");
  const [minute, setMinute] = useState(selectedMinute ?? "00");
  const panelRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsOpen(true));
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [close]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Drag-to-dismiss
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);
  const isDragging = useRef(false);

  const onDragStart = useCallback((clientY: number) => {
    isDragging.current = true;
    dragStartY.current = clientY;
    dragCurrentY.current = clientY;
    if (panelRef.current) panelRef.current.style.transition = "none";
  }, []);

  const onDragMove = useCallback((clientY: number) => {
    if (!isDragging.current || !panelRef.current) return;
    dragCurrentY.current = clientY;
    const delta = Math.max(0, clientY - dragStartY.current);
    panelRef.current.style.transform = `translateY(${delta}px)`;
  }, []);

  const onDragEnd = useCallback(() => {
    if (!isDragging.current || !panelRef.current) return;
    isDragging.current = false;
    const delta = dragCurrentY.current - dragStartY.current;
    panelRef.current.style.transition = "";
    panelRef.current.style.transform = "";
    if (delta > 80) close();
  }, [close]);

  useEffect(() => {
    const handleTouchMove = (e: TouchEvent) => onDragMove(e.touches[0].clientY);
    const handleTouchEnd = () => onDragEnd();
    const handleMouseMove = (e: MouseEvent) => onDragMove(e.clientY);
    const handleMouseUp = () => onDragEnd();

    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onDragMove, onDragEnd]);

  return (
    <>
      <div
        className={`eta-overlay${isOpen ? " eta-overlay--open" : ""}`}
        onClick={close}
      />
      <div
        ref={panelRef}
        className={`eta-panel${isOpen ? " eta-panel--open" : ""}`}
      >
        <div
          className="eta-panel__handle"
          onTouchStart={(e) => onDragStart(e.touches[0].clientY)}
          onMouseDown={(e) => { e.preventDefault(); onDragStart(e.clientY); }}
          style={{ cursor: "grab", touchAction: "none" }}
        >
          <div className="eta-panel__handle-bar" />
        </div>

        <div className="eta-panel__body">
          <WheelColumn items={HOURS} selected={hour} onSelect={setHour} label="Timme" />
          <div className="eta-panel__colon">:</div>
          <WheelColumn items={MINUTES} selected={minute} onSelect={setMinute} label="Minut" />
        </div>

        <div className="eta-panel__footer">
          <button
            type="button"
            className="eta-panel__btn eta-panel__btn--primary"
            onClick={() => onSelect(hour, minute)}
          >
            Använd
          </button>
        </div>
      </div>
    </>
  );
}

registerCardComponent("estimatedArrival", EstimatedArrivalCard);
export default EstimatedArrivalCard;
