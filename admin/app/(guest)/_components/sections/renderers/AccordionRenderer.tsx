"use client";

/**
 * Accordion Section Renderers
 *
 * Default: bordered rows, items separated by border-top/bottom
 * Card:    each item in its own container/card that expands
 *
 * Both share the same AccordionItem component — only the
 * section wrapper and CSS class differ.
 */

import { useState, useCallback, useEffect } from "react";
import type { SectionRendererProps, ResolvedBlock } from "@/app/_lib/sections/types";
import { ElementRenderer } from "../elements";
import "./accordion-renderer.css";

// ─── Shared toggle hook ──────────────────────────────────

function computeOpenIds(blocks: ResolvedBlock[], defaultMode: string): Set<string> {
  if (defaultMode === "all_open") {
    return new Set(blocks.map((b) => b.block.id));
  }
  if (defaultMode === "first_open" && blocks.length > 0) {
    return new Set([blocks[0].block.id]);
  }
  return new Set();
}

function useAccordionToggle(
  blocks: ResolvedBlock[],
  defaultMode: string,
  allowMultiple: boolean,
) {
  const [openIds, setOpenIds] = useState<Set<string>>(() =>
    computeOpenIds(blocks, defaultMode),
  );

  // Sync when defaultMode changes (editor live-preview)
  useEffect(() => {
    setOpenIds(computeOpenIds(blocks, defaultMode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultMode]);

  const toggle = useCallback(
    (blockId: string) => {
      setOpenIds((prev) => {
        const next = new Set(prev);
        if (next.has(blockId)) {
          next.delete(blockId);
        } else {
          if (!allowMultiple) next.clear();
          next.add(blockId);
        }
        return next;
      });
    },
    [allowMultiple],
  );

  return { openIds, toggle };
}

// ─── Shared section settings ─────────────────────────────

function useSharedSettings(settings: Record<string, unknown>) {
  return {
    iconPosition: (settings.iconPosition as string) || "right",
    gap: (settings.gap as number) ?? 0,
    defaultMode: (settings.defaultMode as string) || "all_closed",
    allowMultiple: (settings.allowMultiple as boolean) ?? false,
    useTransition: (settings.useTransition as boolean) ?? true,
  };
}

// ─── Shared section padding ──────────────────────────────

function useSectionPadding(settings: Record<string, unknown>) {
  const pt = (settings.paddingTop as number) ?? 0;
  const pr = (settings.paddingRight as number) ?? 0;
  const pb = (settings.paddingBottom as number) ?? 0;
  const pl = (settings.paddingLeft as number) ?? 0;
  const hasPadding = pt || pr || pb || pl;
  return hasPadding ? `${pt}px ${pr}px ${pb}px ${pl}px` : undefined;
}

// ═══════════════════════════════════════════════════════════
// DEFAULT VARIANT — bordered rows
// ═══════════════════════════════════════════════════════════

export function AccordionDefaultRenderer(props: SectionRendererProps) {
  const { section, settings, presetSettings, blocks } = props;

  const shared = useSharedSettings(settings);
  const borderColor = (presetSettings.borderColor as string) || "#E6E5E3";

  const padding = useSectionPadding(settings);
  const { openIds, toggle } = useAccordionToggle(blocks, shared.defaultMode, shared.allowMultiple);

  if (blocks.length === 0) return null;

  const cls = [
    "s-accordion",
    "s-accordion--default",
    shared.useTransition && "s-accordion--animated",
  ].filter(Boolean).join(" ");

  return (
    <section
      className={cls}
      data-section-id={section.id}
      style={{
        padding,
        gap: shared.gap || undefined,
        "--accordion-border": borderColor,
      } as React.CSSProperties}
    >
      {blocks.map((block, i) => (
        <AccordionItem
          key={block.block.id}
          block={block}
          isOpen={openIds.has(block.block.id)}
          isLast={i === blocks.length - 1}
          iconPosition={shared.iconPosition}
          onToggle={() => toggle(block.block.id)}
        />
      ))}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// CARD VARIANT — each item in its own container
// ═══════════════════════════════════════════════════════════

export function AccordionCardRenderer(props: SectionRendererProps) {
  const { section, settings, presetSettings, blocks } = props;

  const shared = useSharedSettings(settings);
  const cardBackground = (presetSettings.cardBackground as string) || "#F5F5F4";
  const cardRadius = (presetSettings.cardRadius as number) ?? 12;
  const cardPadding = (presetSettings.cardPadding as number) ?? 16;

  const padding = useSectionPadding(settings);
  const { openIds, toggle } = useAccordionToggle(blocks, shared.defaultMode, shared.allowMultiple);

  if (blocks.length === 0) return null;

  const cls = [
    "s-accordion",
    "s-accordion--card",
    shared.useTransition && "s-accordion--animated",
  ].filter(Boolean).join(" ");

  return (
    <section
      className={cls}
      data-section-id={section.id}
      style={{
        padding,
        gap: shared.gap || undefined,
        "--accordion-card-bg": cardBackground,
        "--accordion-card-radius": `${cardRadius}px`,
        "--accordion-card-padding": `${cardPadding}px`,
      } as React.CSSProperties}
    >
      {blocks.map((block) => (
        <AccordionItem
          key={block.block.id}
          block={block}
          isOpen={openIds.has(block.block.id)}
          isLast={false}
          iconPosition={shared.iconPosition}
          onToggle={() => toggle(block.block.id)}
        />
      ))}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════
// SHARED — Accordion Item
// ═══════════════════════════════════════════════════════════

function AccordionItem({
  block,
  isOpen,
  isLast,
  iconPosition,
  onToggle,
}: {
  block: ResolvedBlock;
  isOpen: boolean;
  isLast: boolean;
  iconPosition: string;
  onToggle: () => void;
}) {
  const titleSlot = block.slots.title;
  const indicatorSlot = block.slots.indicator;
  const contentSlot = block.slots.content;

  const indicator = (
    <div className="s-accordion__indicator">
      {indicatorSlot?.elements.map((resolved) => (
        <ElementRenderer key={resolved.element.id} resolved={resolved} />
      ))}
    </div>
  );

  return (
    <div
      className={`s-accordion__item${isOpen ? " s-accordion__item--open" : ""}${isLast ? " s-accordion__item--last" : ""}`}
      data-block-id={block.block.id}
    >
      <button
        type="button"
        className="s-accordion__header"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        {iconPosition === "left" && indicator}
        <div className="s-accordion__title">
          {titleSlot?.elements.map((resolved) => (
            <ElementRenderer key={resolved.element.id} resolved={resolved} />
          ))}
        </div>
        {iconPosition !== "left" && indicator}
      </button>

      <div className="s-accordion__body" aria-hidden={!isOpen}>
        <div className="s-accordion__content">
          {contentSlot?.elements.map((resolved) => (
            <ElementRenderer key={resolved.element.id} resolved={resolved} />
          ))}
        </div>
      </div>
    </div>
  );
}
