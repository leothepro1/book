import type { ResolvedElement } from "@/app/_lib/sections/types";

export function DividerElement({ resolved }: { resolved: ResolvedElement }) {
  const { settings } = resolved;
  const style = (settings.style as string) || "solid";
  const color = (settings.color as string) || "#E6E5E3";
  const thickness = (settings.thickness as number) ?? 1;
  const spacing = (settings.spacing as number) ?? 16;

  return (
    <hr
      style={{
        border: "none",
        borderTop: `${thickness}px ${style} ${color}`,
        margin: `${spacing}px 0`,
      }}
    />
  );
}
