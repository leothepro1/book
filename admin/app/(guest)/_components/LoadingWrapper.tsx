"use client";

import { useEffect, useState } from "react";
import AppLoader from "./AppLoader";

type Props = {
  children: React.ReactNode;
  /** Minimum loading time in ms (prevents flash) */
  minLoadTime?: number;
};

export default function LoadingWrapper({ children, minLoadTime = 0 }: Props) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const startTime = Date.now();
    
    // Wait for both mount and minimum time
    const timer = setTimeout(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, minLoadTime - elapsed);
      
      setTimeout(() => {
        setIsLoading(false);
      }, remaining);
    }, 0);

    return () => clearTimeout(timer);
  }, [minLoadTime]);

  if (isLoading) {
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

  return <>{children}</>;
}
