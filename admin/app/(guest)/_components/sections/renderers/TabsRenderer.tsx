"use client";

/**
 * Tabs Section Renderer
 *
 * Renders both "underline" and "pill" preset variants.
 * Each block is a "tab" with a label, icon slot, and content slot.
 * First tab is active by default.
 *
 * COLOR SCHEME INTEGRATION:
 * All colors derive from section-scoped CSS variables:
 *   - Tab text:         var(--text) with opacity for inactive
 *   - Indicator/border: var(--text) for underline, var(--button-bg/fg) for pill
 *   - Background:       var(--background) inherited from section scope
 */

import { useState } from "react";
import type { SectionRendererProps, ResolvedBlock } from "@/app/_lib/sections/types";
import { SlotRenderer } from "../SlotRenderer";

// ─── Underline Variant ──────────────────────────────────────

export function TabsUnderlineRenderer(props: SectionRendererProps) {
  const { section, settings, presetSettings, blocks } = props;
  const [activeIndex, setActiveIndex] = useState(0);

  const padding = (settings.padding as number) ?? 16;
  const alignment = (presetSettings.alignment as string) || "left";

  if (blocks.length === 0) return null;

  const activeBlock = blocks[activeIndex] ?? blocks[0];

  return (
    <section
      data-section-id={section.id}
      style={{ padding, backgroundColor: "var(--background)" }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid color-mix(in srgb, var(--text, #171717) 12%, transparent)",
          justifyContent: alignment === "center" ? "center" : alignment === "stretch" ? "stretch" : "flex-start",
        }}
      >
        {blocks.map((block, i) => (
          <TabButton
            key={block.block.id}
            block={block}
            active={i === activeIndex}
            onClick={() => setActiveIndex(i)}
            stretch={alignment === "stretch"}
          />
        ))}
      </div>

      {/* Active tab content */}
      <div style={{ paddingTop: 16 }}>
        <TabContent block={activeBlock} />
      </div>
    </section>
  );
}

// ─── Pill Variant ───────────────────────────────────────────

export function TabsPillRenderer(props: SectionRendererProps) {
  const { section, settings, presetSettings, blocks } = props;
  const [activeIndex, setActiveIndex] = useState(0);

  const padding = (settings.padding as number) ?? 16;
  const gap = (presetSettings.gap as number) ?? 8;

  if (blocks.length === 0) return null;

  const activeBlock = blocks[activeIndex] ?? blocks[0];

  return (
    <section
      data-section-id={section.id}
      style={{ padding, backgroundColor: "var(--background)" }}
    >
      {/* Pill bar */}
      <div style={{ display: "flex", gap, flexWrap: "wrap" }}>
        {blocks.map((block, i) => {
          const isActive = i === activeIndex;
          const label = (block.settings.label as string) || `Flik ${i + 1}`;

          return (
            <button
              key={block.block.id}
              type="button"
              onClick={() => setActiveIndex(i)}
              style={{
                padding: "6px 16px",
                borderRadius: 8000,
                border: "none",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                background: isActive
                  ? "var(--button-bg, #1a1a1a)"
                  : "color-mix(in srgb, var(--text, #171717) 8%, transparent)",
                color: isActive
                  ? "var(--button-fg, #fff)"
                  : "var(--text, #171717)",
                opacity: isActive ? 1 : 0.6,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Active tab content */}
      <div style={{ paddingTop: 16 }}>
        <TabContent block={activeBlock} />
      </div>
    </section>
  );
}

// ─── Shared Components ──────────────────────────────────────

function TabButton({
  block,
  active,
  onClick,
  stretch,
}: {
  block: ResolvedBlock;
  active: boolean;
  onClick: () => void;
  stretch: boolean;
}) {
  const label = (block.settings.label as string) || "Flik";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 16px",
        border: "none",
        borderBottom: active
          ? "2px solid var(--text, #171717)"
          : "2px solid transparent",
        background: "transparent",
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        color: "var(--text, #171717)",
        opacity: active ? 1 : 0.5,
        cursor: "pointer",
        transition: "all 0.15s",
        flex: stretch ? 1 : undefined,
        textAlign: "center",
      }}
    >
      {label}
    </button>
  );
}

function TabContent({ block }: { block: ResolvedBlock }) {
  const contentSlot = block.slots.content;
  const iconSlot = block.slots.icon;

  return (
    <div data-block-id={block.block.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {iconSlot && <SlotRenderer slot={iconSlot} />}
      {contentSlot && <SlotRenderer slot={contentSlot} />}
    </div>
  );
}
