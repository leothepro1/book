import type { ResolvedElement } from "@/app/_lib/sections/types";

export function IconElement({ resolved }: { resolved: ResolvedElement }) {
  const { settings } = resolved;
  const icon = (settings.name as string) || "star";
  const size = (settings.size as number) ?? 24;
  const color = (settings.color as string) || "#1a1a1a";
  const alignment = (settings.alignment as string) || "center";

  return (
    <div style={{ textAlign: alignment as any }}>
      <span
        style={{ fontSize: size, color, lineHeight: 1 }}
        role="img"
        aria-label={icon}
      >
        {getIconChar(icon)}
      </span>
    </div>
  );
}

function getIconChar(icon: string): string {
  const map: Record<string, string> = {
    star: "★",
    heart: "♥",
    check: "✓",
    arrow: "→",
    info: "ℹ",
    warning: "⚠",
    phone: "☎",
    email: "✉",
    location: "📍",
    calendar: "📅",
  };
  return map[icon] || "●";
}
