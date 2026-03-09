"use client";

import { useRef, useState, useEffect, useCallback } from "react";

type TabData = {
  id: string;
  label: string;
  items: { image: string; title: string }[];
};

export function PebbleTabsClient({
  tabs,
}: {
  tabs: TabData[];
}) {
  const [activeTab, setActiveTab] = useState(0);
  const activeItems = tabs[activeTab]?.items ?? [];
  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback((index: number) => {
    const container = tabsRef.current;
    if (!container) return;
    const btn = container.children[index] as HTMLElement | undefined;
    if (!btn) return;
    setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, []);

  useEffect(() => {
    updateIndicator(activeTab);
  }, [activeTab, updateIndicator]);

  // Update on mount after layout
  useEffect(() => {
    requestAnimationFrame(() => updateIndicator(activeTab));
  }, [activeTab, updateIndicator]);

  return (
    <>
      {/* Tabs */}
      <div
        ref={tabsRef}
        style={{
          display: "flex",
          gap: 30,
          overflowX: "auto",
          scrollbarWidth: "none",
          paddingBottom: 6,
          position: "relative",
        }}
      >
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(i)}
            style={{
              flex: "0 0 auto",
              padding: "8px 0",
              borderRadius: 0,
              border: "none",
              borderBottom: "2px solid transparent",
              background: "transparent",
              color: i === activeTab ? "#1a1a1a" : "var(--text, #1a1a1a)",
              fontSize: 16,
              fontWeight: 600,
              fontFamily: "var(--font-button, var(--font-body))",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "color 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
              opacity: i === activeTab ? 1 : 0.6,
            }}
          >
            {tab.label}
          </button>
        ))}

        {/* Sliding indicator — inside scroll container so it scrolls with tabs */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            height: 2,
            background: "var(--button-bg, #1a1a1a)",
            borderRadius: 1,
            transition: "transform 0.25s cubic-bezier(0.25, 0.1, 0.25, 1), width 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)",
            willChange: "transform, width",
            transform: `translateX(${indicator.left}px)`,
            width: indicator.width,
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 12,
          marginTop: 16,
        }}
      >
        {activeItems.map((item, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                aspectRatio: "1 / 1",
                borderRadius: "var(--tile-radius, 12px)",
                overflow: "hidden",
                background: "var(--tile-bg, #f0efed)",
              }}
            >
              <img
                src={item.image}
                alt={item.title}
                draggable={false}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: "var(--text, #1a1a1a)",
                fontFamily: "var(--font-body)",
                lineHeight: 1.3,
              }}
            >
              {item.title}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
