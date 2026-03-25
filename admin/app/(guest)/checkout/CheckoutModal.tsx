"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { Loading } from "@/app/_components/Loading";
import "./checkout-modal.css";

interface CheckoutModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Show loading animation in body area while content is not ready. */
  loading?: boolean;
}

const EXIT_DURATION = 250;

export function CheckoutModal({ open, onClose, title, children, loading = false }: CheckoutModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  // Mount → visible (enter), or close → invisible → unmount (exit)
  useEffect(() => {
    if (open) {
      setMounted(true);
      // RAF to ensure DOM is painted before adding visible class
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else if (mounted) {
      // Instant close — no exit transition
      setVisible(false);
      setMounted(false);
    }
  }, [open, mounted]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    if (!mounted) return;
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [mounted, handleClose]);

  // Lock body scroll
  useEffect(() => {
    if (mounted) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div className={`com__overlay${visible ? " com__overlay--visible" : ""}`} onClick={handleClose}>
      <div
        className={`com__modal${visible ? " com__modal--visible" : ""}`}
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="com__header">
          <h2 className="com__title">{title}</h2>
          <button type="button" className="com__close" onClick={handleClose} aria-label="Stäng">
            <span className="material-symbols-rounded" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>
        <div className="com__body">
          {loading ? (
            <div className="com__loading">
              <Loading size={40} />
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
