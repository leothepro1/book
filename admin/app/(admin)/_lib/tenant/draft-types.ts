import type { TenantConfig } from "@/app/(guest)/_lib/tenant/types";

/** Deeply partial TenantConfig — matches deepmerge's actual merge semantics. */
export type DraftPatch = {
  [K in keyof TenantConfig]?: TenantConfig[K] extends (infer U)[]
    ? U[]
    : TenantConfig[K] extends Record<string, unknown>
      ? Partial<TenantConfig[K]>
      : TenantConfig[K];
};
