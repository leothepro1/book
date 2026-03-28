"use client";

import { useState, useRef, useEffect } from "react";
import type { PerformanceResult, MetricResult } from "@/app/_lib/rum/performance";
import {
  PERFORMANCE_BADGE_STYLES,
  getRating,
  formatMetricValue,
  type PerformanceRating,
} from "@/app/_lib/rum/badge";

interface Props {
  performance: PerformanceResult | null;
  loading?: boolean;
}

const TOOLTIPS: Record<string, { label: string; desc: string }> = {
  lcp: {
    label: "Kort sagt – hur snabbt sidan läses in",
    desc: "Largest Contentful Paint (LCP)-resultatet mäter laddningshastigheten, baserat på hur snabbt det största elementet eller huvudinnehållet blir synligt för besökare. Ett bra LCP-resultat uppnås när huvudinnehållet läses in inom 2 500 millisekunder från det att sidladdningen börjar för den 75:e percentilen av användare.",
  },
  inp: {
    label: "Kort sagt – hur rapp din webbplats känns",
    desc: "Interaction to Next Paint (INP)-resultatet mäter interaktivitet baserat på hur lång tid det tar för sidan att bli responsiv för de flesta användaråtgärder, som att klicka på en länk eller en knapp. Ett INP-resultat på mindre än 200 millisekunder för den 75:e percentilen av användare anses vara en bra prestanda eftersom sidan blir interaktiv snabbt.",
  },
  sessions: {
    label: "Sessioner per enhetstyp",
    desc: "Antal besök i webbshoppen",
  },
};

function Tooltip({ tooltipKey, children }: { tooltipKey: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tip = TOOLTIPS[tooltipKey];

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  if (!tip) return <>{children}</>;

  return (
    <div ref={ref} style={{ position: "relative" }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      {open && (
        <div className="perf-tooltip">
          <div className="perf-tooltip__label">{tip.label}</div>
          <div className="perf-tooltip__desc">{tip.desc}</div>
        </div>
      )}
    </div>
  );
}

function PerformanceBadge({ rating }: { rating: PerformanceRating }) {
  const style = PERFORMANCE_BADGE_STYLES[rating];
  return (
    <span
      style={{
        background: style.background,
        color: style.color,
        borderRadius: "4px",
        padding: "2px 8px",
        fontSize: "12px",
        fontWeight: 500,
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: style.color,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {style.label}
    </span>
  );
}

function MetricColumn({
  label,
  metric,
  data,
}: {
  label: string;
  metric: "lcp" | "inp" | "cls";
  data: MetricResult | null | undefined;
}) {
  if (!data) {
    return (
      <div>
        <Tooltip tooltipKey={metric}>
          <div className="perf-col__label">{label}</div>
        </Tooltip>
        <div className="perf-col__value perf-col__value--empty">--</div>
        <div className="perf-col__meta">
          <span style={{ fontSize: 12, color: "#9CA3AF" }}>Inte tillräckligt med data</span>
        </div>
      </div>
    );
  }

  const rating = getRating(metric, data.p75);

  return (
    <div>
      <Tooltip tooltipKey={metric}>
        <div className="perf-col__label">{label}</div>
      </Tooltip>
      <div className="perf-col__value">{formatMetricValue(metric, data.p75)}</div>
      <div className="perf-col__meta">
        <PerformanceBadge rating={rating} />
      </div>
    </div>
  );
}

export function PerformanceWidget({ performance, loading }: Props) {
  // LOADING — skeleton
  if (loading) {
    return (
      <div className="perf-widget">
        <div>
          <div className="perf-skeleton" style={{ width: 60, height: 12, marginBottom: 8 }} />
          <div className="perf-skeleton" style={{ width: 160, height: 22, marginBottom: 8 }} />
          <div className="perf-skeleton" style={{ width: 40, height: 18 }} />
        </div>
        <div className="perf-divider" />
        <div>
          <div className="perf-skeleton" style={{ width: 60, height: 12, marginBottom: 8 }} />
          <div className="perf-skeleton" style={{ width: 120, height: 22, marginBottom: 8 }} />
          <div className="perf-skeleton" style={{ width: 40, height: 18 }} />
        </div>
        <div className="perf-divider" />
        <div>
          <div className="perf-skeleton" style={{ width: 140, height: 12, marginBottom: 8 }} />
          <div className="perf-skeleton" style={{ width: 200, height: 22 }} />
        </div>
      </div>
    );
  }

  const hasData = performance?.hasEnoughData ?? false;

  return (
    <div className="perf-widget">
      {/* LCP P75 */}
      <MetricColumn label="LCP P75" metric="lcp" data={hasData ? performance?.lcp : undefined} />

      <div className="perf-divider" />

      {/* INP P75 */}
      <MetricColumn label="INP P75" metric="inp" data={hasData ? performance?.inp : undefined} />

      <div className="perf-divider" />

      {/* Sessions by device */}
      <div>
        <Tooltip tooltipKey="sessions">
          <div className="perf-col__label">Sessioner per enhetstyp</div>
        </Tooltip>
        {hasData && performance ? (
          <div className="perf-col__sessions">
            <div className="perf-session-item">
              <span className="perf-session-item__count">{performance.sessionsByDevice.desktop}</span>
              <span className="perf-session-item__label">Dator</span>
            </div>
            <div className="perf-session-item">
              <span className="perf-session-item__count">{performance.sessionsByDevice.mobile}</span>
              <span className="perf-session-item__label">Mobil</span>
            </div>
            <div className="perf-session-item">
              <span className="perf-session-item__count">{performance.sessionsByDevice.tablet}</span>
              <span className="perf-session-item__label">Surfplatta</span>
            </div>
          </div>
        ) : (
          <>
            <div className="perf-col__value perf-col__value--empty">--</div>
            <div className="perf-col__meta">
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>Behöver minst 50 sessioner</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
