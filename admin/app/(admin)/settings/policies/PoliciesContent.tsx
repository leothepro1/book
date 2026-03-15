"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { EditorIcon } from "@/app/_components/EditorIcon";
import { Tooltip } from "@/app/_components/Tooltip";
import { getPolicies, savePolicy } from "./actions";
import type { PolicyRecord } from "./actions";

type PolicyItem = {
  id: string;
  label: string;
  icon: string;
  placeholder: string;
};

const POLICY_ITEMS: PolicyItem[] = [
  { id: "booking-terms", label: "Bokningsvillkor", icon: "hotel", placeholder: "Beskriv villkoren för bokning, avbokning och ändring av reservationer..." },
  { id: "checkin-terms", label: "Incheckningsvillkor", icon: "event_available", placeholder: "Beskriv rutiner och krav vid incheckning, t.ex. legitimation, tider och nyckelhämtning..." },
  { id: "house-rules", label: "Husregler", icon: "house", placeholder: "Beskriv regler för vistelsen, t.ex. rökning, husdjur, ljudnivå och gemensamma utrymmen..." },
  { id: "privacy-policy", label: "Integritetspolicy", icon: "lock", placeholder: "Beskriv hur ni samlar in, lagrar och hanterar gästers personuppgifter..." },
  { id: "terms-of-service", label: "Användarvillkor", icon: "breaking_news", placeholder: "Beskriv de allmänna villkoren för användning av er tjänst och gästportal..." },
];

function ButtonSpinner({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [animState, setAnimState] = useState<"enter" | "exit" | "idle">("idle");
  const prevVisible = useRef(visible);

  useEffect(() => {
    if (visible && !prevVisible.current) { setMounted(true); setAnimState("enter"); }
    else if (!visible && prevVisible.current) { setAnimState("exit"); }
    prevVisible.current = visible;
  }, [visible]);

  const handleAnimationEnd = () => {
    if (animState === "exit") { setMounted(false); setAnimState("idle"); }
    else if (animState === "enter") { setAnimState("idle"); }
  };

  if (!mounted) return null;
  return (
    <svg className={`btn-spinner ${animState === "exit" ? "btn-spinner--out" : ""}`}
      width="18" height="18" viewBox="0 0 21 21" fill="none"
      style={{ marginTop: 1 }} onAnimationEnd={handleAnimationEnd} aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="2" strokeDasharray="33 14.1" strokeLinecap="round" />
    </svg>
  );
}

type PoliciesContentProps = {
  onSubTitleChange?: (title: string | null) => void;
};

export function PoliciesContent({ onSubTitleChange }: PoliciesContentProps) {
  const [editingPolicy, setEditingPolicy] = useState<PolicyItem | null>(null);
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedPolicies, setSavedPolicies] = useState<Map<string, PolicyRecord>>(new Map());
  const [loaded, setLoaded] = useState(false);

  // Load all policies on mount
  useEffect(() => {
    getPolicies().then((records) => {
      const map = new Map<string, PolicyRecord>();
      for (const r of records) map.set(r.policyId, r);
      setSavedPolicies(map);
      setLoaded(true);
    });
  }, []);

  function openPolicy(item: PolicyItem) {
    const existing = savedPolicies.get(item.id);
    const text = existing?.content ?? "";
    setEditingPolicy(item);
    setContent(text);
    setOriginalContent(text);
  }

  function closeModal() {
    setEditingPolicy(null);
    setContent("");
    setOriginalContent("");
  }

  async function handleSave() {
    if (!editingPolicy) return;
    setIsSaving(true);
    const result = await savePolicy(editingPolicy.id, content);
    setIsSaving(false);

    if (result.ok) {
      // Update local cache
      const trimmed = content.trim();
      setSavedPolicies((prev) => {
        const next = new Map(prev);
        if (trimmed) {
          next.set(editingPolicy.id, {
            policyId: editingPolicy.id,
            content: trimmed,
            updatedAt: new Date().toISOString(),
          });
        } else {
          next.delete(editingPolicy.id);
        }
        return next;
      });
      closeModal();
    }
  }

  const hasChanges = content !== originalContent;

  return (
    <div>
      <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--admin-text)", marginBottom: 4 }}>
        Skriftliga policyer
      </h4>
      <p className="admin-desc" style={{ marginBottom: 16 }}>
        Policyer länkas i vissa steg och platser i din gästportal.
      </p>

      <div style={{
        border: "1px solid var(--admin-border)",
        borderRadius: 10,
        overflow: "hidden",
        padding: 0,
      }}>
        {POLICY_ITEMS.map((item, i) => {
          const hasSaved = savedPolicies.has(item.id);

          return (
            <button
              key={item.id}
              onClick={() => openPolicy(item)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: 16,
                border: "none", background: "#fff", cursor: "pointer",
                textAlign: "left", fontSize: 14, fontWeight: 400, lineHeight: "1em",
                color: "var(--admin-text)",
                borderBottom: i < POLICY_ITEMS.length - 1 ? "1px solid var(--admin-border)" : "none",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--admin-surface-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
            >
              <EditorIcon name={item.icon} size={18} style={{ color: "var(--admin-text-secondary)", flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {loaded && (
                hasSaved ? (
                  <Tooltip label="Policyn är ifylld" placement="top">
                    <EditorIcon name="check_circle" size={16} style={{ color: "#1a7f37", flexShrink: 0 }} />
                  </Tooltip>
                ) : (
                  <Tooltip label="Information saknas" placement="top">
                    <EditorIcon name="error" size={16} style={{ color: "#C62828", flexShrink: 0 }} />
                  </Tooltip>
                )
              )}
              <EditorIcon name="chevron_right" size={18} style={{ color: "var(--admin-text-tertiary)", flexShrink: 0 }} />
            </button>
          );
        })}
      </div>

      {/* Policy edit modal */}
      {editingPolicy && createPortal(
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={closeModal}
        >
          <div style={{
            position: "absolute", inset: 0,
            background: "var(--admin-overlay)",
            animation: "settings-modal-fade-in 0.15s ease",
          }} />
          <div
            style={{
              position: "relative", zIndex: 1,
              background: "var(--admin-surface)",
              borderRadius: 16, width: 540,
              maxHeight: "80vh", display: "flex", flexDirection: "column",
              animation: "settings-modal-scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "#F9F8F7", borderBottom: "1px solid #E6E5E3",
              padding: "20px 20px 12px 20px", borderRadius: "16px 16px 0 0",
            }}>
              <h3 style={{ fontSize: 17, fontWeight: 600 }}>{editingPolicy.label}</h3>
              <button
                onClick={closeModal}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "none", background: "transparent",
                  cursor: "pointer", color: "var(--admin-text-secondary)",
                }}
                aria-label="Stäng"
              >
                <EditorIcon name="close" size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: 20, flex: 1, overflowY: "auto" }}>
              <textarea
                className="admin-float-input"
                placeholder={editingPolicy.placeholder}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                style={{
                  width: "100%", minHeight: 180, padding: "12px 14px",
                  resize: "vertical", fontSize: 14, lineHeight: 1.6,
                  fontFamily: "var(--admin-font)",
                }}
              />
            </div>

            {/* Footer */}
            <div style={{
              display: "flex", justifyContent: "flex-end", gap: 8,
              padding: "12px 20px 20px", borderTop: "1px solid #E6E5E3",
            }}>
              <button
                className="settings-btn--outline"
                style={{ border: "none" }}
                disabled={isSaving}
                onClick={closeModal}
              >
                Avbryt
              </button>
              <button
                className="settings-btn--connect"
                disabled={isSaving || !hasChanges}
                onClick={handleSave}
              >
                <ButtonSpinner visible={isSaving} />
                Spara
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
