/**
 * GET /api/accommodation-types
 *
 * Returns the distinct AccommodationType values available for a tenant.
 * Tenant resolved from Host header — never from query params.
 * Backed by getAccommodationTypes() which uses unstable_cache (5 min TTL).
 *
 * Response: { types: AccommodationType[] }
 */

import { NextResponse } from "next/server";
import { resolveTenantFromHost } from "@/app/(guest)/_lib/tenant/resolveTenantFromHost";
import { getAccommodationTypes } from "@/app/_lib/search/getAccommodationTypes";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const tenant = await resolveTenantFromHost();
  if (!tenant) {
    return NextResponse.json(
      { error: "TENANT_NOT_FOUND", message: "Okänd tenant." },
      { status: 401, headers: NO_STORE },
    );
  }

  const types = await getAccommodationTypes(tenant.id);

  return NextResponse.json({ types }, { headers: NO_STORE });
}
