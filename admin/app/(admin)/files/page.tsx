"use client";

import { useRef } from "react";
import FilesClient from "./FilesClient";
import "./files.css";

export default function FilesPage() {
  const uploadRef = useRef<(() => void) | null>(null);

  return (
    <div className="admin-page admin-page--no-preview files-page">
      <div className="admin-editor">
        <div className="admin-header">
          <h1 className="admin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 22 }}>home_storage</span>
            Filer
          </h1>
          <div className="admin-actions">
            <button
              className="settings-btn--connect"
              style={{ fontSize: 13, padding: "5px 12px" }}
              onClick={() => uploadRef.current?.()}
            >
              Ladda upp filer
            </button>
          </div>
        </div>
        <div className="admin-content">
          <FilesClient onUploadRef={uploadRef} />
        </div>
      </div>
    </div>
  );
}
