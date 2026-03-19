"use client";

import { useEffect, useState } from "react";
import { WalletCard } from "@/app/_lib/access-pass/WalletCard";
import type { CardDesignConfig } from "@/app/_lib/access-pass/card-design";

export default function WalletPreviewClient({
  cardDesign,
  dateLabel,
}: {
  cardDesign: CardDesignConfig;
  dateLabel: string;
}) {
  const [design, setDesign] = useState(cardDesign);

  // Listen for live updates from editor via postMessage
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "wallet-card-update" && e.data.design) {
        setDesign(e.data.design);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <div style={{
      background: "#fff",
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <WalletCard design={design} dateLabel={dateLabel} />
      </div>
    </div>
  );
}
