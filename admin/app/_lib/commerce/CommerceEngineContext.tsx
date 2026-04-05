"use client";

/**
 * Commerce Engine Context
 * ═══════════════════════
 *
 * Provides a single CommerceEngine instance to all descendants.
 * Pattern: identical to ProductContext — context + provider + hook.
 *
 * Without this, every component calling useCommerceEngine() gets an
 * isolated instance with independent state. The provider ensures
 * one shared engine per page.
 */

import { createContext, useContext, type ReactNode } from "react";
import { useCommerceEngine } from "./useCommerceEngine";
import type { AccommodationSelection, CommerceEngine } from "./types";

const CommerceEngineCtx = createContext<CommerceEngine | null>(null);

export function CommerceEngineProvider({
  tenantId,
  initialSelection,
  children,
}: {
  tenantId: string;
  initialSelection?: AccommodationSelection;
  children: ReactNode;
}) {
  const engine = useCommerceEngine({ tenantId, initialSelection });

  return (
    <CommerceEngineCtx.Provider value={engine}>
      {children}
    </CommerceEngineCtx.Provider>
  );
}

export function useCommerceEngineContext(): CommerceEngine {
  const engine = useContext(CommerceEngineCtx);
  if (!engine) {
    throw new Error(
      "useCommerceEngineContext must be used within CommerceEngineProvider",
    );
  }
  return engine;
}
