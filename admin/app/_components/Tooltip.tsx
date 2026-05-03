/**
 * Re-export shim — the Tooltip primitive lives in
 * `app/(admin)/_components/ui/Tooltip.tsx` since the May 2026
 * promotion. This file exists so legacy imports
 * (`@/app/_components/Tooltip`) keep working without a synchronous
 * codebase-wide migration.
 *
 * Migrate consumers to the new path opportunistically; once the
 * grep below is empty, this file can be deleted.
 *
 *   grep -r "from.*_components/Tooltip" app/   # → 0
 */

export { Tooltip } from '@/app/(admin)/_components/ui/Tooltip';
export type {
  TooltipProps,
  TooltipPlacement,
} from '@/app/(admin)/_components/ui/Tooltip';
