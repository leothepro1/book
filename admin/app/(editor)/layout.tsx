"use client";

import type { ReactNode } from "react";
import "@/app/(admin)/base.css";
import { NavigationGuardProvider, UnsavedChangesModal } from "@/app/(admin)/_components/NavigationGuard";

export default function EditorLayout({ children }: { children: ReactNode }) {
  return (
    <NavigationGuardProvider>
      {children}
      <UnsavedChangesModal />
    </NavigationGuardProvider>
  );
}
