import type { ResolvedElement } from "@/app/_lib/sections/types";
import { MaterialIcon } from "./MaterialIcon";

export function IconElement({ resolved }: { resolved: ResolvedElement }) {
  const { settings } = resolved;
  const name = (settings.name as string) || "star";
  const size = (settings.size as number) ?? 24;
  const weight = (settings.weight as number) ?? 400;
  const fill = (settings.fill as string) === "filled";
  const color = (settings.color as string) || "#1a1a1a";

  return (
    <div style={{ textAlign: "center", placeSelf: "center" }}>
      <MaterialIcon name={name} size={size} weight={weight} fill={fill} color={color} />
    </div>
  );
}
