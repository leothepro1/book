"use client";

import { useState } from "react";
import { PreviewProvider, GuestPreviewFrame } from "../_components/GuestPreview";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import type { PreviewRoute } from "../_components/GuestPreview/types";
import "../_components/GuestPreview/preview.css";

interface Props {
  initialConfig: TenantConfig;
}

export default function PreviewDemoClient({ initialConfig }: Props) {
  const [route] = useState<PreviewRoute>("/p/[token]");

  return (
    <PreviewProvider initialConfig={initialConfig} enableRealtime={true}>
      <div style={{
        padding: 40,
        background: "#fafafa",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
      }}>
        <GuestPreviewFrame route={route} />
      </div>
    </PreviewProvider>
  );
}
