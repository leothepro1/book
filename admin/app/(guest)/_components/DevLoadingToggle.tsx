"use client";

import { useEffect, useState } from "react";
import AppLoader from "./AppLoader";

export default function DevLoadingToggle() {
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    // Expose global function
    (window as any)._loading_true = () => setShowLoading(true);
    (window as any)._loading_false = () => setShowLoading(false);

    return () => {
      delete (window as any)._loading_true;
      delete (window as any)._loading_false;
    };
  }, []);

  if (!showLoading) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--background)",
        zIndex: 1,
      }}
    >
      <div style={{ transform: "scale(2)" }}>
        <AppLoader size={48} colorVar="--text" ariaLabel="Laddar portal" />
      </div>
    </div>
  );
}
