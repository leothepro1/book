/**
 * Channel Manager Health Check Stub
 *
 * Called by the app health cron and manual "Testa anslutning" button.
 * INTERNAL_API_SECRET verified in the Authorization header.
 *
 * TODO: Implement real OTA channel connectivity checks.
 */

import { env } from "@/app/_lib/env";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.INTERNAL_API_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  return Response.json({ ok: true, provider: "channel-manager" });
}
