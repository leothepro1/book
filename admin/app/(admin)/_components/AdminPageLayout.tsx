"use client";

import type { ReactNode } from "react";
import { GuestPreviewFrame, PreviewProvider } from "./GuestPreview";
import type { PreviewRoute } from "./GuestPreview/types";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import "./GuestPreview/preview.css";
import "./admin-page.css";

interface AdminPageLayoutProps {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  config: TenantConfig;
  previewRoute?: PreviewRoute;
}

export default function AdminPageLayout({
  title,
  actions,
  children,
  config,
  previewRoute = "/p/[token]" as PreviewRoute,
}: AdminPageLayoutProps) {
  return (
    <PreviewProvider initialConfig={config} enableRealtime={false}>
      <div className="admin-page">
        <div className="admin-editor">
          <div className="admin-header">
            <h1 className="admin-title">{title}</h1>
            {actions && <div className="admin-actions">{actions}</div>}
          </div>
          <div className="admin-content">
            {children}
          </div>
        </div>
        <div className="admin-preview">
          <GuestPreviewFrame route={previewRoute} />
        </div>
      </div>
    </PreviewProvider>
  );
}
