import type { ResolvedElement } from "@/app/_lib/sections/types";

// ─── Arrow Icon ──────────────────────────────────────────────

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3.5 8h9M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── Circle Badge (radius follows tenantConfig) ──────────────

const CIRCLE_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  flexShrink: 0,
  borderRadius: "var(--button-radius, 999px)" as string,
  background: "currentColor",
};

const CIRCLE_ICON_STYLE: React.CSSProperties = {
  /* Inverted color — icon sits on currentColor background */
  color: "var(--button-bg, #1a1a1a)" as string,
  display: "flex",
};

function CircleIcon() {
  return (
    <span style={CIRCLE_STYLE}>
      <span style={CIRCLE_ICON_STYLE}>
        <ArrowIcon />
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
  const iconPosition = (settings.iconPosition as string) || "none";
  const iconCircle = settings.iconCircle as boolean;
  const width = (settings.width as string) || "auto";

  const icon = iconPosition !== "none"
    ? (iconCircle ? <CircleIcon /> : <ArrowIcon />)
    : null;

  const style: React.CSSProperties = {
    ...BASE,
    width: width === "full" ? "100%" : "max-content",
  };

  const content = (
    <>
      {iconPosition === "left" && icon}
      <span>{label}</span>
      {iconPosition === "right" && icon}
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
