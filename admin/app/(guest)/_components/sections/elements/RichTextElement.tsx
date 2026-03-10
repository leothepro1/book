import type { ResolvedElement } from "@/app/_lib/sections/types";

const HEADING_SIZE_MAP: Record<string, string> = {
  sm: "clamp(1.5rem, 1.25rem + 1vw, 2rem)",
  md: "clamp(1.875rem, 1.5rem + 1.5vw, 2.5rem)",
  lg: "clamp(2.25rem, 1.75rem + 2vw, 3.25rem)",
  xl: "clamp(2.75rem, 2rem + 3vw, 4rem)",
};

const TEXT_SIZE_MAP: Record<string, string> = {
  xs: "0.8rem",
  sm: "0.875rem",
  md: "1rem",
  lg: "1.125rem",
};

export function RichTextElement({ resolved }: { resolved: ResolvedElement }) {
  const { settings } = resolved;

  const headingContent = settings.heading_content as string;
  const headingSize = (settings.heading_size as string) || "md";
  const headingAlignment = (settings.heading_alignment as string) || "center";

  const textContent = settings.text_content as string;
  const textSize = (settings.text_size as string) || "md";
  const textAlignment = (settings.text_alignment as string) || "left";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2
        style={{
          fontSize: HEADING_SIZE_MAP[headingSize] || HEADING_SIZE_MAP.md,
          fontWeight: 700,
          textAlign: headingAlignment as any,
          margin: 0,
          lineHeight: 1.3,
          fontFamily: "var(--font-heading, inherit)" as string,
          color: "var(--text)",
        }}
        dangerouslySetInnerHTML={{ __html: headingContent }}
      />
      <p
        style={{
          fontSize: TEXT_SIZE_MAP[textSize] || TEXT_SIZE_MAP.md,
          fontWeight: 400,
          textAlign: textAlignment as any,
          color: "var(--text)",
          opacity: 0.8,
          margin: 0,
          lineHeight: 1.6,
        }}
        dangerouslySetInnerHTML={{ __html: textContent }}
      />
    </div>
  );
}
