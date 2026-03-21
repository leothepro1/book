import type { ResolvedElement } from "@/app/_lib/sections/types";

const PLACEHOLDER_SRC = "https://res.cloudinary.com/dmgmoisae/image/upload/v1774113375/palceholder_21_dygpku.png";

export function ImageElement({ resolved }: { resolved: ResolvedElement }) {
  const { settings } = resolved;
  const src = (settings.src as string) || PLACEHOLDER_SRC;
  const width = (settings.width as number) ?? 100;
  const height = (settings.height as number) ?? 300;
  const radiusTopLeft = (settings.radiusTopLeft as number) ?? 0;
  const radiusTopRight = (settings.radiusTopRight as number) ?? 0;
  const radiusBottomRight = (settings.radiusBottomRight as number) ?? 0;
  const radiusBottomLeft = (settings.radiusBottomLeft as number) ?? 0;
  const overlay = (settings.overlay as number) ?? 0;

  const borderRadius = `${radiusTopLeft}px ${radiusTopRight}px ${radiusBottomRight}px ${radiusBottomLeft}px`;

  return (
    <div
      style={{
        position: "relative",
        width: `${width}%`,
        height: height > 0 ? height : undefined,
        borderRadius,
        overflow: "hidden",
      }}
    >
      <img
        src={src}
        alt=""
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
      {overlay > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `rgba(0, 0, 0, ${overlay / 100})`,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}
