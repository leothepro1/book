import type { ResolvedElement } from "@/app/_lib/sections/types";
import { MaterialIcon } from "./MaterialIcon";

export function IconElement({ resolved }: { resolved: ResolvedElement }) {
  const { settings } = resolved;
  const name = (settings.name as string) || "star";
  const size = (settings.size as number) ?? 24;
  const weight = (settings.weight as number) ?? 400;
  const fill = (settings.fill as string) === "filled";
  // Icon color: use explicit setting if set, otherwise inherit from scheme text color
  const rawColor = settings.color as string | undefined;
  const color = rawColor || undefined;

  return (
    <div style={{ textAlign: "center", placeSelf: "center", color: "var(--text, #1a1a1a)" }}>
      <MaterialIcon name={name} size={size} weight={weight} fill={fill} color={color ?? "currentColor"} />
    </div>
  );
}
