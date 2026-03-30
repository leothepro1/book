"use client";

import { useState, useTransition } from "react";
import AccommodationsClient from "./AccommodationsClient";
import type { ResolvedAccommodation } from "@/app/_lib/accommodations/types";

export default function AccommodationsPageClient({
  accommodations,
  tenantId,
}: {
  accommodations: ResolvedAccommodation[];
  tenantId: string;
}) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [, startTransition] = useTransition();

  const handleSync = () => {
    setIsSyncing(true);
    startTransition(async () => {
      try {
        await fetch("/api/products/sync-pms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId }),
        });
        window.location.reload();
      } catch {
        setIsSyncing(false);
      }
    });
  };

  return (
    <div className="admin-page admin-page--no-preview accommodations-page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>bed</span>
            Boenden
          </h1>
          <div className="admin-actions">
            <button
              className="settings-btn--connect"
              style={{ fontSize: 13, padding: "5px 12px" }}
              onClick={handleSync}
              disabled={isSyncing}
            >
              {isSyncing ? "Synkar..." : "Synka PMS"}
            </button>
          </div>
        </div>
        <div className="admin-content">
          <AccommodationsClient
            accommodations={accommodations}
            onSync={handleSync}
          />
        </div>
      </div>
    </div>
  );
}
