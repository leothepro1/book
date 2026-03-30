"use client";

import { useState, useTransition } from "react";
import AccommodationsClient from "./AccommodationsClient";
import type { ResolvedAccommodation } from "@/app/_lib/accommodations/types";

export default function AccommodationsPageClient({
  accommodations,
  categories,
  tenantId,
}: {
  accommodations: ResolvedAccommodation[];
  categories: Array<{ id: string; title: string }>;
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
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>villa</span>
            Boenden
          </h1>
        </div>
        <div className="admin-content">
          <AccommodationsClient
            accommodations={accommodations}
            categories={categories}
            onSync={handleSync}
          />
        </div>
      </div>
    </div>
  );
}
