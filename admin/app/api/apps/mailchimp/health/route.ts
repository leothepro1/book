import { env } from "@/app/_lib/env";
import { prisma } from "@/app/_lib/db/prisma";
import { mailchimpAdapter } from "@/app/_lib/apps/email-marketing/adapters/mailchimp";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.INTERNAL_API_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");
  if (!tenantId) return Response.json({ ok: false, error: "Missing tenantId" }, { status: 400 });

  const tenantApp = await prisma.tenantApp.findUnique({
    where: { tenantId_appId: { tenantId, appId: "mailchimp" } },
  });
  if (!tenantApp) return Response.json({ ok: false, error: "Not installed" }, { status: 503 });

  const settings = (tenantApp.settings as Record<string, Record<string, unknown>>) ?? {};
  const apiKey = (settings["api-key"]?.apiKey as string) ?? "";
  if (!apiKey) return Response.json({ ok: false, error: "API-nyckel saknas" }, { status: 503 });

  const start = Date.now();
  const result = await mailchimpAdapter.validateCredentials(apiKey);
  const latencyMs = Date.now() - start;

  if (result.valid) {
    return Response.json({ ok: true, provider: "mailchimp", latencyMs });
  }

  return Response.json({ ok: false, error: result.error ?? "Anslutningsfel" }, { status: 503 });
}
