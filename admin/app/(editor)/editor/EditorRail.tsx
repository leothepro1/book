"use client";

import { useEditor, type RailTab } from "./EditorContext";
import { Tooltip } from "@/app/_components/Tooltip";
import { EditorIcon } from "@/app/_components/EditorIcon";

/**
 * Vertical icon rail (leftmost column).
 *
 * Each button controls which panel is visible in the side panel column.
 * Uses aria-pressed for accessibility — screen readers announce
 * the active state correctly.
 */
export function EditorRail() {
  const { activeRail, setActiveRail } = useEditor();

  return (
    <nav className="editor-rail" aria-label="Editorpaneler">
      <Tooltip label="Sektioner" placement="bottom">
        <RailButton
          tab="sections"
          label="Sektioner"
          active={activeRail === "sections"}
          onSelect={setActiveRail}
        >
          <EditorIcon name="grid_view" size={20} />
        </RailButton>
      </Tooltip>

      <Tooltip label="Design" placement="bottom">
        <RailButton
          tab="settings"
          label="Design"
          active={activeRail === "settings"}
          onSelect={setActiveRail}
        >
          <EditorIcon name="settings" size={20} />
        </RailButton>
      </Tooltip>
    </nav>
  );
}

function RailButton({
  tab,
  label,
  active,
  onSelect,
  children,
}: {
  tab: RailTab;
  label: string;
  active: boolean;
  onSelect: (tab: RailTab) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`editor-rail__btn${active ? " editor-rail__btn--active" : ""}`}
      onClick={() => onSelect(tab)}
      aria-pressed={active}
      aria-label={label}
    >
      {children}
    </button>
  );
}
