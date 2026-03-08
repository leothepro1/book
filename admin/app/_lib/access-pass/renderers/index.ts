/**
 * Wallet renderer registry.
 *
 * Adapters are registered here and looked up by platform key.
 * Core never imports individual renderers directly — always go through
 * this registry so adapters can be swapped without touching core.
 */

import type { WalletRenderer } from "../types";
import { appleRenderer } from "./apple";
import { googleRenderer } from "./google";

const renderers: Record<string, WalletRenderer> = {
  APPLE: appleRenderer,
  GOOGLE: googleRenderer,
};

export function getRenderer(platform: "APPLE" | "GOOGLE"): WalletRenderer {
  const renderer = renderers[platform];
  if (!renderer) {
    throw new Error(`No wallet renderer registered for platform: ${platform}`);
  }
  return renderer;
}

export function getAllRenderers(): WalletRenderer[] {
  return Object.values(renderers);
}
