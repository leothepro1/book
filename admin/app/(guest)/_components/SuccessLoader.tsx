"use client";

import { useEffect, useRef } from "react";
import lottie from "lottie-web";
import animationData from "../_assets/lottie/success.json";

export default function SuccessLoader({
  size = 120,
  color = "#22c55e" // fast brand-färg
}: {
  size?: number;
  color?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const anim = lottie.loadAnimation({
      container: ref.current,
      renderer: "svg",
      loop: false,
      autoplay: true,
      animationData,
      rendererSettings: {
        preserveAspectRatio: "xMidYMid meet"
      }
    });

    return () => anim.destroy();
  }, []);

  return (
    <div className="successLoader"
      style={{
        width: size,
        height: size,
        color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <div ref={ref} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
