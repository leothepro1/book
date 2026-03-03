import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";

/**
 * Preview mode: vilket config ska användas
 */
export type PreviewMode = "draft" | "live";

/**
 * Preview route: vilken guest portal sida ska visas
 */
export type PreviewRoute = 
  | "/p/[token]"           // Portal home
  | "/p/[token]/account"   // Account page
  | "/p/[token]/stays"     // Stays page
  | "/check-in"            // Check-in
  | "/check-out";          // Check-out

/**
 * Props för GuestPreview component
 */
export interface GuestPreviewProps {
  /** Vilken route ska visas */
  route: PreviewRoute;
  
  /** Optional: className för styling */
  className?: string;
}

/**
 * Draft update event (för SSE)
 */
export interface DraftUpdateEvent {
  type: "draft_updated";
  tenantId: string;
  updatedAt: string;
  updatedBy: string;
  changes: Partial<TenantConfig>;
}
