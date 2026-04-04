"use client";

import { useEffect, useState, useCallback } from "react";
import { getOrderFormatSettings, updateOrderFormat } from "./actions";
import { formatOrderNumber } from "@/app/_lib/orders/format";

type GeneralContentProps = {
  onSubTitleChange?: (title: string | null) => void;
};

export function GeneralContent({ onSubTitleChange }: GeneralContentProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [nextNumber, setNextNumber] = useState(1001);
  const [savedPrefix, setSavedPrefix] = useState("");
  const [savedSuffix, setSavedSuffix] = useState("");

  useEffect(() => {
    onSubTitleChange?.(null);
    getOrderFormatSettings().then((data) => {
      if (data) {
        setPrefix(data.orderNumberPrefix);
        setSuffix(data.orderNumberSuffix);
        setSavedPrefix(data.orderNumberPrefix);
        setSavedSuffix(data.orderNumberSuffix);
        setNextNumber(data.nextOrderNumber);
      }
      setLoading(false);
    });
  }, [onSubTitleChange]);

  const isDirty = prefix !== savedPrefix || suffix !== savedSuffix;

  const handleSave = useCallback(async () => {
    setSaving(true);
    const result = await updateOrderFormat(prefix, suffix);
    if (result.ok) {
      setSavedPrefix(prefix);
      setSavedSuffix(suffix);
    }
    setSaving(false);
  }, [prefix, suffix]);

  // Preview: show next 3 order numbers
  const previewNumbers = [nextNumber, nextNumber + 1, nextNumber + 2];
  const previewText = previewNumbers
    .map((n) => formatOrderNumber(n, prefix || "", suffix || ""))
    .join(", ");

  if (loading) {
    return (
      <div style={{ padding: "24px 0" }}>
        <div className="skel skel--heading" style={{ width: 180, marginBottom: 8 }} />
        <div className="skel skel--text" style={{ width: 300, marginBottom: 24 }} />
        <div style={{ display: "flex", gap: 12 }}>
          <div className="skel" style={{ width: "50%", height: 60 }} />
          <div className="skel" style={{ width: "50%", height: 60 }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 0" }}>
      {/* ── Order ID format ── */}
      <h4
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--admin-text)",
          marginBottom: 4,
        }}
      >
        Format på order-ID
      </h4>
      <p
        className="admin-desc"
        style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.45 }}
      >
        Visas på ordersidan, kundsidor och i kundorderaviseringar för att
        identifiera ordern.
      </p>

      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label
            className="admin-label"
            style={{ display: "block", marginBottom: 6 }}
          >
            Prefix
          </label>
          <input
            type="text"
            className="admin-input--sm"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="#"
            maxLength={20}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label
            className="admin-label"
            style={{ display: "block", marginBottom: 6 }}
          >
            Suffix
          </label>
          <input
            type="text"
            className="admin-input--sm"
            value={suffix}
            onChange={(e) => setSuffix(e.target.value)}
            placeholder=""
            maxLength={20}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      {/* ── Live preview ── */}
      <p
        style={{
          fontSize: 13,
          color: "var(--admin-text-secondary)",
          marginBottom: 16,
        }}
      >
        Ditt order-ID kommer att visas som{" "}
        <strong style={{ color: "var(--admin-text)" }}>
          {previewText}
        </strong>
        {" …"}
      </p>

      {/* ── Save button ── */}
      {isDirty && (
        <button
          type="button"
          className="admin-btn admin-btn--accent"
          style={{ fontSize: 13, padding: "7px 16px" }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Sparar…" : "Spara"}
        </button>
      )}
    </div>
  );
}
