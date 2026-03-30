export const dynamic = "force-dynamic";

/**
 * Geo Test Route — Development only.
 * Tests GeoIP resolution for a given IP address.
 */

import { NextResponse } from "next/server";
import { resolveGeo } from "@/app/_lib/analytics/geo";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const url = new URL(req.url);
  const ip = url.searchParams.get("ip") ?? "8.8.8.8";
  const result = await resolveGeo(ip);

  return NextResponse.json({ ip, result });
}
