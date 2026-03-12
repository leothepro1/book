import type { ResolvedElement } from "@/app/_lib/sections/types";

const SIZE_MAP: Record<string, string> = {
  xs: "1rem",
  sm: "clamp(1.5rem, 1.25rem + 1vw, 2rem)",
  md: "clamp(1.875rem, 1.5rem + 1.5vw, 2.5rem)",
  lg: "clamp(2.25rem, 1.75rem + 2vw, 3.25rem)",
  xl: "clamp(2.75rem, 2rem + 3vw, 4rem)",
};

export function HeadingElement({ resolved }: { resolved: ResolvedElement }) {
  const { settings } = resolved;
  const content = settings.content as string;
  const size = (settings.size as string) || "md";
  const alignment = (settings.alignment as string) || "center";

  const style: React.CSSProperties = {
    textAlign: alignment as React.CSSProperties["textAlign"],
    fontSize: SIZE_MAP[size] || SIZE_MAP.md,
    margin: 0,
    lineHeight: 1.2,
    fontWeight: 700,
    fontFamily: "var(--font-heading)",
    color: "var(--text)",
  };

  return <h2 style={style} dangerouslySetInnerHTML={{ __html: content }} />;
}
