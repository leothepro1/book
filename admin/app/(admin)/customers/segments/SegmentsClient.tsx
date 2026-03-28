"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSegments, type SegmentListItem } from "./actions";

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just nu";
  if (diffMin < 60) return `${diffMin} min sedan`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? "timme" : "timmar"} sedan`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} ${diffDays === 1 ? "dag" : "dagar"} sedan`;
  return d.toLocaleDateString("sv-SE");
}

function pctLabel(memberCount: number, totalCustomers: number): string {
  if (totalCustomers === 0) return "0 %";
  const pct = (memberCount / totalCustomers) * 100;
  if (pct === 0) return "0 %";
  if (pct < 1) return "< 1 %";
  return `${Math.round(pct)} %`;
}

export function SegmentsClient() {
  const router = useRouter();
  const [segments, setSegments] = useState<SegmentListItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSegments().then(setSegments).finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  if (segments.length === 0) {
    return (
      <div className="cst-empty">
        <span className="material-symbols-rounded cst-empty__icon" style={{ fontSize: 48 }}>segment</span>
        <h2 className="cst-empty__title">Inga segment</h2>
        <p className="cst-empty__desc">Segment grupperar kunder automatiskt baserat på regler du definierar.</p>
      </div>
    );
  }

  return (
    <>
      {/* Column headers */}
      <div className="cst-column-headers">
        <span className="cst-col cst-col--name">Namn</span>
        <span className="cst-col cst-col--marketing">% av kunder</span>
        <span className="cst-col cst-col--location">Senaste aktivitet</span>
      </div>

      {/* Rows */}
      {segments.map((seg) => (
        <div
          key={seg.id}
          className="cst-row"
          onClick={() => {}}
        >
          <div className="cst-col cst-col--name">
            <span className="cst-row__name">{seg.name}</span>
          </div>
          <div className="cst-col cst-col--marketing">
            <span style={{ fontSize: 13 }}>{pctLabel(seg.memberCount, seg.totalCustomers)}</span>
          </div>
          <div className="cst-col cst-col--location">
            <span className="cst-row__location">{seg.lastActivity ? formatRelativeDate(seg.lastActivity) : "—"}</span>
          </div>
        </div>
      ))}
    </>
  );
}
