"use client";

/**
 * LogoElement — Renders the tenant's logo from config.
 *
 * No image upload. Reads logoUrl from config.theme.header.
 * Settings control alignment (place-self) and width only.
 */

import type { ResolvedElement } from "@/app/_lib/sections/types";
import { usePreview } from "@/app/(admin)/_components/GuestPreview";

const ALIGN_MAP: Record<string, string> = {
  left: "start",
  center: "center",
  right: "end",
};

export function LogoElement({ resolved }: { resolved: ResolvedElement }) {
  const { config } = usePreview();
  const { settings } = resolved;

  const alignment = (settings.alignment as string) || "center";
  const width = (settings.width as number) ?? 120;
  const logoUrl = config?.theme?.header?.logoUrl;

  if (!logoUrl) {
    return (
      <div
        style={{
          width,
          height: width * 0.4,
          borderRadius: 8,
          background: "#F0EFED",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#8C8B89",
          fontSize: 13,
          placeSelf: ALIGN_MAP[alignment] ?? "center",
        }}
      >
        Ingen logotyp
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt="Logo"
      style={{
        width,
        height: "auto",
        display: "block",
        placeSelf: ALIGN_MAP[alignment] ?? "center",
      }}
    />
  );
}
