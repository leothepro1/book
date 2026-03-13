import type { ResolvedElement } from "@/app/_lib/sections/types";

export function DividerElement({ resolved }: { resolved: ResolvedElement }) {
  const { settings } = resolved;
  const style = (settings.style as string) || "solid";
  const thickness = (settings.thickness as number) ?? 1;

  return (
    <hr
      style={{
        border: "none",
        borderTop: `${thickness}px ${style} color-mix(in srgb, var(--text, #171717) 15%, transparent)`,
        margin: 0,
        placeSelf: "center",
        width: "100%",
      }}
    />
  );
}
