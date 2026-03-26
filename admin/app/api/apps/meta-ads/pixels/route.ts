import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/(admin)/_lib/auth/devAuth";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getValidAccessToken } from "@/app/_lib/apps/meta-ads/oauth";
import { log } from "@/app/_lib/logger";

const META_GRAPH = "https://graph.facebook.com/v19.0";

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantData = await getCurrentTenant();
  if (!tenantData) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "Missing accountId" }, { status: 400 });

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(tenantData.tenant.id);
  } catch (err) {
    log("error", "meta-ads.pixels_token_failed", { error: String(err) });
    return NextResponse.json({ error: "Meta-token ogiltig" }, { status: 401 });
  }

  try {
    const res = await fetch(
      `${META_GRAPH}/${accountId}/adspixels?fields=id,name,last_fired_time&access_token=${accessToken}`,
    );

    if (!res.ok) {
      return NextResponse.json({ error: `Kunde inte hämta pixlar (${res.status})` }, { status: 502 });
    }

    const data = await res.json();
    const pixels = (data.data ?? []).map((p: Record<string, unknown>) => ({
      id: String(p.id),
      name: String(p.name ?? `Pixel ${p.id}`),
      lastFiredAt: p.last_fired_time ? String(p.last_fired_time) : null,
    }));

    return NextResponse.json({ pixels });
  } catch (err) {
    log("error", "meta-ads.pixels_fetch_error", { error: String(err) });
    return NextResponse.json({ error: "Kunde inte hämta pixlar" }, { status: 500 });
  }
}
