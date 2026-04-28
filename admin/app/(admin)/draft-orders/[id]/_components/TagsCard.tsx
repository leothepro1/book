"use client";

import { type CSSProperties } from "react";

const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  padding: "16px",
  boxShadow:
    "0 .3125rem .3125rem -.15625rem #00000008, 0 .1875rem .1875rem -.09375rem #00000005, 0 .125rem .125rem -.0625rem #00000005, 0 .0625rem .0625rem -.03125rem #00000008, 0 .03125rem .03125rem #0000000a, 0 0 0 .0625rem #0000000f",
};

const CHIPS: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
};

const CHIP: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 8px",
  background: "var(--admin-surface-muted)",
  border: "1px solid var(--admin-border)",
  borderRadius: 6,
  fontSize: 13,
  color: "var(--admin-text)",
  lineHeight: 1.3,
};

const EMPTY: CSSProperties = {
  fontSize: 13,
  color: "var(--admin-text-muted)",
};

interface TagsCardProps {
  tags: string[];
}

export function TagsCard({ tags }: TagsCardProps) {
  return (
    <div style={CARD}>
      <div className="pf-card-header" style={{ marginBottom: 12 }}>
        <span className="pf-card-title">Taggar</span>
      </div>

      {tags.length === 0 ? (
        <p style={EMPTY}>Inga taggar.</p>
      ) : (
        <div style={CHIPS}>
          {tags.map((tag) => (
            <span key={tag} style={CHIP}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
