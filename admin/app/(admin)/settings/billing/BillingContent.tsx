"use client";

import { useState, useEffect } from "react";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { getCurrentPeriod, getBillingHistory } from "@/app/_lib/apps/billing";
import type { CurrentBillingInfo, BillingPeriodSummary } from "@/app/_lib/apps/billing";

function formatAmount(oren: number): string {
  return `${Math.round(oren / 100)} kr`;
}

function formatPeriodLabel(start: string): string {
  const d = new Date(start);
  const months = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
  return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  OPEN: { label: "Pågående", color: "var(--admin-accent)" },
  PENDING: { label: "Väntar på faktura", color: "#d97706" },
  INVOICED: { label: "Fakturerad", color: "#16a34a" },
  VOID: { label: "Ingen debitering", color: "var(--admin-text-tertiary)" },
};

export function BillingContent({ onSubTitleChange }: { onSubTitleChange: (s: string) => void }) {
  const [current, setCurrent] = useState<CurrentBillingInfo | null>(null);
  const [history, setHistory] = useState<BillingPeriodSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);

  useEffect(() => {
    onSubTitleChange("");
    Promise.all([getCurrentPeriod(), getBillingHistory(12)]).then(([c, h]) => {
      setCurrent(c);
      setHistory(h);
      setLoading(false);
    });
  }, [onSubTitleChange]);

  if (loading) {
    return (
      <div style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--admin-text-tertiary)" }}>
        Laddar fakturering...
      </div>
    );
  }

  return (
    <div style={{ padding: "0 var(--space-5)" }}>
      {/* Current period */}
      <div style={{ marginBottom: "var(--space-8)" }}>
        <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, color: "var(--admin-text)", marginBottom: "var(--space-4)" }}>
          Innevarande period
        </h3>

        {!current?.billingEnabled && (
          <div style={{
            display: "flex", alignItems: "center", gap: "var(--space-3)",
            padding: "var(--space-3) var(--space-4)",
            background: "color-mix(in srgb, var(--admin-accent) 6%, var(--admin-surface))",
            border: "1px solid color-mix(in srgb, var(--admin-accent) 20%, transparent)",
            borderRadius: "var(--radius-md)", marginBottom: "var(--space-4)",
            fontSize: "var(--font-sm)", color: "var(--admin-text-secondary)",
          }}>
            <EditorIcon name="info" size={18} style={{ color: "var(--admin-accent)", flexShrink: 0 }} />
            Fakturering är inte aktiverad. Användningen spåras men inga debiteringar görs.
          </div>
        )}

        {current && current.periodStart && (
          <div style={{
            background: "var(--admin-surface)", borderRadius: "var(--radius-lg)",
            boxShadow: "var(--admin-shadow-sm)", overflow: "hidden",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "var(--space-4) var(--space-5)",
              borderBottom: "1px solid var(--admin-border)",
            }}>
              <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--admin-text)" }}>
                {formatPeriodLabel(current.periodStart)}
              </span>
              <span style={{ fontSize: "var(--font-lg)", fontWeight: 600, color: "var(--admin-text)" }}>
                {formatAmount(current.totalAmount)}
              </span>
            </div>

            <div style={{ padding: "var(--space-3) var(--space-5)" }}>
              {current.lineItems.length === 0 ? (
                <div style={{ padding: "var(--space-3) 0", fontSize: "var(--font-sm)", color: "var(--admin-text-tertiary)" }}>
                  Inga app-debiteringar denna period.
                </div>
              ) : (
                current.lineItems.map((li) => (
                  <div key={li.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "var(--space-2) 0",
                    borderBottom: "1px solid color-mix(in srgb, var(--admin-text) 6%, transparent)",
                  }}>
                    <div>
                      <div style={{ fontSize: "var(--font-sm)", color: "var(--admin-text)" }}>{li.description}</div>
                      {li.isProrated && li.daysCharged && li.daysInPeriod && (
                        <div style={{ fontSize: "var(--font-xs)", color: "var(--admin-text-tertiary)", marginTop: 1 }}>
                          Proraterat — {li.daysCharged} av {li.daysInPeriod} dagar
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--admin-text)" }}>
                      {formatAmount(li.amount)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* History */}
      <div>
        <h3 style={{ fontSize: "var(--font-lg)", fontWeight: 600, color: "var(--admin-text)", marginBottom: "var(--space-4)" }}>
          Historik
        </h3>

        {history.length === 0 ? (
          <div style={{ padding: "var(--space-6)", textAlign: "center", fontSize: "var(--font-sm)", color: "var(--admin-text-tertiary)" }}>
            Ingen faktureringshistorik ännu.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {history.map((period) => {
              const st = STATUS_LABELS[period.status] ?? STATUS_LABELS.VOID;
              const isExpanded = expandedPeriod === period.id;

              return (
                <div key={period.id} style={{
                  background: "var(--admin-surface)", borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--admin-shadow-sm)", overflow: "hidden",
                }}>
                  <div
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "var(--space-3) var(--space-5)", cursor: "pointer",
                    }}
                    onClick={() => setExpandedPeriod(isExpanded ? null : period.id)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                      <span style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--admin-text)" }}>
                        {formatPeriodLabel(period.periodStart)}
                      </span>
                      <span style={{
                        display: "inline-block", padding: "1px 6px",
                        borderRadius: "var(--radius-full)", fontSize: 11, fontWeight: 500,
                        background: `color-mix(in srgb, ${st.color} 12%, transparent)`,
                        color: st.color,
                      }}>
                        {st.label}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                      <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--admin-text)" }}>
                        {formatAmount(period.totalAmount)}
                      </span>
                      <EditorIcon name={isExpanded ? "expand_less" : "expand_more"} size={18} style={{ color: "var(--admin-text-tertiary)" }} />
                    </div>
                  </div>

                  {isExpanded && period.lineItems.length > 0 && (
                    <div style={{ padding: "0 var(--space-5) var(--space-3)", borderTop: "1px solid var(--admin-border)" }}>
                      {period.lineItems.map((li) => (
                        <div key={li.id} style={{
                          display: "flex", justifyContent: "space-between",
                          padding: "var(--space-2) 0", fontSize: "var(--font-xs)",
                          borderBottom: "1px solid color-mix(in srgb, var(--admin-text) 4%, transparent)",
                        }}>
                          <span style={{ color: "var(--admin-text-secondary)" }}>{li.description}</span>
                          <span style={{ color: "var(--admin-text)", fontWeight: 500 }}>{formatAmount(li.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
