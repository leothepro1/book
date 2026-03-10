import type { ResolvedElement } from "@/app/_lib/sections/types";

const SIZE_MAP: Record<string, string> = {
  xs: "0.8rem",
  sm: "0.875rem",
  md: "1rem",
  lg: "1.125rem",
};

export function TextElement({ resolved }: { resolved: ResolvedElement }) {
  const { settings } = resolved;
  const content = settings.content as string;
  const alignment = (settings.alignment as string) || "left";
  const size = (settings.size as string) || "md";

  return (
    <p
      style={{
        textAlign: alignment as any,
        fontSize: SIZE_MAP[size] || SIZE_MAP.md,
        fontWeight: 400,
        color: "var(--text)",
        opacity: 0.8,
        margin: 0,
        lineHeight: 1.6,
      }}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
