"use client";

/**
 * Editor Client — Top-level Composition Root
 * ───────────────────────────────────────────
 * Wires together all providers and layout components for the
 * full-screen section editor.
 *
 * Provider stack (outermost → innermost):
 *   PreviewProvider  → config state, optimistic updates, iframe sync
 *   PublishBarProvider → undo/redo, publish workflow, dirty tracking
 *   EditorProvider   → editor UI state (active rail, selected section)
 *
 * This file should remain thin — it only composes providers and
 * the EditorShell layout. All logic lives in child components.
 */

import { PreviewProvider } from "@/app/(admin)/_components/GuestPreview";
import { PublishBarProvider } from "@/app/(admin)/_components/PublishBar";
import { EditorProvider } from "./EditorContext";
import { EditorShell } from "./EditorShell";
import "./editor.css";
import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";

export default function EditorClient({ initialConfig }: { initialConfig: TenantConfig }) {
  return (
    <PreviewProvider initialConfig={initialConfig}>
      <PublishBarProvider>
        <EditorProvider>
          <EditorShell />
        </EditorProvider>
      </PublishBarProvider>
    </PreviewProvider>
  );
}
