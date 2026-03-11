import type { ResolvedElement } from "@/app/_lib/sections/types";
import { MaterialIcon } from "./MaterialIcon";

// ─── Arrow Icon (legacy fallback) ────────────────────────────

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3.5 8h9M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── Circle Badge (radius follows tenantConfig) ──────────────

function CircleIcon({ name, size, weight, fill }: { name?: string; size?: number; weight?: number; fill?: boolean }) {
  const badgeSize = Math.max(28, (size ?? 20) + 12);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: badgeSize,
        height: badgeSize,
        flexShrink: 0,
        borderRadius: "var(--button-radius, 999px)" as string,
        background: "currentColor",
      }}
    >
      <span style={{ color: "var(--button-bg, #1a1a1a)" as string, display: "flex" }}>
        {name ? <MaterialIcon name={name} size={size ?? 16} weight={weight} fill={fill} /> : <ArrowIcon />}
      </span>
    </span>
  );
}

// ─── Button Styles (all from CSS custom properties) ──────────

const BASE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "0.7rem 1.4rem",
  fontSize: "0.95rem",
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
  borderRadius: "var(--button-radius, 999px)" as string,
  fontFamily: "var(--font-button, var(--font-heading, inherit))" as string,
  background: "var(--button-bg, #1a1a1a)" as string,
  color: "var(--button-fg, #fff)" as string,
  border: "none",
  transition: "opacity 0.15s",
};

// ─── Component ───────────────────────────────────────────────

export function ButtonElement({ resolved }: { resolved: ResolvedElement }) {
  const { settings, action } = resolved;
  const label = (settings.label as string) || "Klicka här";
  const width = (settings.width as string) || "auto";

  // Icon settings
  const iconName = (settings.icon as string) || "";
  const iconPlacement = (settings.icon_placement as string) || "right";
  const iconSize = (settings.icon_size as number) ?? 20;
  const iconWeight = (settings.icon_weight as number) ?? 400;
  const iconFill = (settings.icon_fill as string) === "filled";
  const iconCircle = settings.iconCircle as boolean;

  // Legacy preset position (hidden field)
  const legacyPosition = (settings.iconPosition as string) || "none";

  // Resolve: new icon system takes priority, then legacy
  let position = "none";
  let icon: React.ReactNode = null;

  if (iconName) {
    // User has set an icon name → show it at chosen placement
    position = iconPlacement;
    if (iconCircle) {
      icon = <CircleIcon name={iconName} size={iconSize} weight={iconWeight} fill={iconFill} />;
    } else {
      icon = <MaterialIcon name={iconName} size={iconSize} weight={iconWeight} fill={iconFill} />;
    }
  } else if (legacyPosition !== "none") {
    // Legacy preset with arrow fallback
    position = legacyPosition;
    if (iconCircle) {
      icon = <CircleIcon />;
    } else {
      icon = <ArrowIcon />;
    }
  }

  const style: React.CSSProperties = {
    ...BASE,
    width: width === "full" ? "100%" : "max-content",
  };

  const content = (
    <>
      {position === "left" && icon}
      <span>{label}</span>
      {position === "right" && icon}
    </>
  );

  const href =
    action.type === "open_url" ? action.url :
    action.type === "phone" ? `tel:${action.number}` :
    action.type === "email" ? `mailto:${action.address}` :
    undefined;

  if (href) {
    return (
      <a href={href} style={style} target={action.type === "open_url" ? action.target : undefined}>
        {content}
      </a>
    );
  }

  return <button type="button" style={style}>{content}</button>;
}
