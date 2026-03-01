"use client";

import { useState } from "react";

type Props = {
  title: string;
  url: string;
  height?: number;
  trigger: React.ReactNode;
};

export default function LinkCardModal({ title, url, height = 600, trigger }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  if (!url) return <>{trigger}</>;

  return (
    <>
      <div onClick={() => setIsOpen(true)} style={{ cursor: "pointer" }}>
        {trigger}
      </div>

      {isOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 18,
              width: "100%",
              maxWidth: 900,
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "var(--text)" }}>
                {title}
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 24,
                  cursor: "pointer",
                  color: "var(--text)",
                  padding: 0,
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ flex: 1, overflow: "hidden" }}>
              <iframe
                src={url}
                title={title}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                }}
                sandbox="allow-scripts allow-same-origin allow-forms"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
