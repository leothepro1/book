/**
 * Section Renderers — Barrel Export
 *
 * Note: Renderer registration via registerSectionRenderer() is used
 * for client-side lookups (e.g. editor preview). For the guest portal
 * (server component), SectionItem.tsx uses a static import map instead.
 */

export { TabsUnderlineRenderer, TabsPillRenderer } from "./TabsRenderer";
