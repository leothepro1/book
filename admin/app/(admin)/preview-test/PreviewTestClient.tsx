"use client";

import { useState } from "react";
import { PreviewProvider, GuestPreviewFrame } from "../_components/GuestPreview";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";
import type { PreviewRoute } from "../_components/GuestPreview/types";
import "../_components/GuestPreview/preview.css";

interface Props {
  initialConfig: TenantConfig;
}

export default function PreviewTestClient({ initialConfig }: Props) {
  const [route, setRoute] = useState<PreviewRoute>("/p/[token]");
  const [device, setDevice] = useState<"mobile" | "tablet" | "desktop">("mobile");

  return (
    <PreviewProvider initialConfig={initialConfig} enableRealtime={true}>
      <div style={{ padding: 40, background: "#fafafa", minHeight: "100vh" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>
              Live Preview Test
            </h1>
            <p style={{ color: "#666", fontSize: 14 }}>
              Test av GuestPreview komponenten med SSE real-time updates
            </p>
          </div>

          {/* Controls */}
          <div style={{ 
            background: "white", 
            padding: 24, 
            borderRadius: 12,
            marginBottom: 24,
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
          }}>
            <div style={{ display: "grid", gap: 16 }}>
              {/* Route Selector */}
              <div>
                <label style={{ 
                  display: "block", 
                  fontSize: 13, 
                  fontWeight: 600,
                  marginBottom: 8,
                  color: "#333"
                }}>
                  Preview Route
                </label>
                <select
                  value={route}
                  onChange={(e) => setRoute(e.target.value as PreviewRoute)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #e5e5e5",
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                >
                  <option value="/p/[token]">Portal Home</option>
                  <option value="/p/[token]/account">Account Page</option>
                  <option value="/p/[token]/stays">Stays Page</option>
                  <option value="/check-in">Check-in</option>
                  <option value="/check-out">Check-out</option>
                </select>
              </div>

              {/* Device Selector */}
              <div>
                <label style={{ 
                  display: "block", 
                  fontSize: 13, 
                  fontWeight: 600,
                  marginBottom: 8,
                  color: "#333"
                }}>
                  Device
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["mobile", "tablet", "desktop"] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDevice(d)}
                      style={{
                        padding: "8px 16px",
                        border: "1px solid #e5e5e5",
                        borderRadius: 8,
                        background: device === d ? "#8B3DFF" : "white",
                        color: device === d ? "white" : "#666",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        textTransform: "capitalize",
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          <GuestPreviewFrame 
            route={route} 
            device={device}
          />

          {/* Instructions */}
          <div style={{ 
            marginTop: 24,
            padding: 20,
            background: "#f0f9ff",
            border: "1px solid #bae6fd",
            borderRadius: 12,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: "#0369a1" }}>
              💡 Test Instructions
            </h3>
            <ol style={{ fontSize: 13, color: "#0c4a6e", lineHeight: 1.6, margin: 0, paddingLeft: 20 }}>
              <li>Open your browser console to see SSE connection logs</li>
              <li>In another tab, update tenant settings (when we build settings editor)</li>
              <li>Watch this preview update automatically in real-time</li>
              <li>Check the "Live" indicator - it should show green when connected</li>
            </ol>
          </div>

          {/* Debug Info */}
          <details style={{ marginTop: 24 }}>
            <summary style={{ 
              cursor: "pointer", 
              padding: 12,
              background: "white",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
            }}>
              🔍 Debug Info
            </summary>
            <pre style={{ 
              marginTop: 12,
              padding: 16,
              background: "#1f2937",
              color: "#f9fafb",
              borderRadius: 8,
              fontSize: 12,
              overflow: "auto",
            }}>
              {JSON.stringify(initialConfig, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </PreviewProvider>
  );
}
