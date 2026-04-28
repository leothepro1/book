"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

export interface HeaderActionsDropdownItem {
  key: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  disabledTooltip?: string;
}

interface HeaderActionsDropdownProps {
  triggerLabel?: string;
  items: HeaderActionsDropdownItem[];
}

const TRIGGER: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "5px 10px",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  background: "#E3E3E3",
  color: "var(--admin-text)",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};

const MENU: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  right: 0,
  minWidth: 200,
  background: "#fff",
  borderRadius: 8,
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  padding: "4px 0",
  zIndex: 10,
};

const ITEM_BASE: CSSProperties = {
  display: "block",
  width: "100%",
  padding: "8px 16px",
  textAlign: "left",
  background: "transparent",
  border: "none",
  fontFamily: "inherit",
  fontSize: 14,
};

export function HeaderActionsDropdown({
  triggerLabel = "Fler åtgärder",
  items,
}: HeaderActionsDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", display: "inline-block" }}
    >
      <button
        type="button"
        style={TRIGGER}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {triggerLabel} ▾
      </button>

      {open && (
        <div role="menu" style={MENU}>
          {items.map((item) => {
            const itemStyle: CSSProperties = {
              ...ITEM_BASE,
              cursor: item.disabled ? "not-allowed" : "pointer",
              opacity: item.disabled ? 0.5 : 1,
              color: item.danger
                ? "var(--admin-danger, #8E0B21)"
                : "var(--admin-text)",
            };
            return (
              <button
                key={item.key}
                role="menuitem"
                type="button"
                onClick={() => {
                  if (item.disabled) return;
                  item.onClick();
                  setOpen(false);
                }}
                disabled={item.disabled}
                title={item.disabled ? item.disabledTooltip : undefined}
                style={itemStyle}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
