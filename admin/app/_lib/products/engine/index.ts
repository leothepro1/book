/**
 * Product Engine — Public API
 *
 * Rendering-agnostic variant selection, pricing, and inventory
 * for standard products. Same pattern as commerce engine.
 */

export { useProductEngine } from "./useProductEngine";
export {
  ProductEngineProvider,
  useProductEngineContext,
  useOptionalProductEngineContext,
} from "./ProductEngineContext";

export type {
  ProductEngine,
  ProductEngineState,
  ProductEngineActions,
} from "./types";
