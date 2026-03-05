import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/app/_lib/db/prisma";

const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 30000;
const DEV_ORG_ID = "org_3AWnuzCOl4ZbDw2zTDUi84uqOMO";

export async function GET(request: NextRequest) {
  const { userId, orgId: clerkOrgId } = await auth();
  const orgId = clerkOrgId ?? (process.env.NODE_ENV === "development" ? DEV_ORG_ID : null);

  if (!orgId) return new Response("Unauthorized", { status: 401 });

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true, draftUpdatedAt: true },
  });

  if (!tenant) return new Response("Tenant not found", { status: 404 });

  const encoder = new TextEncoder();
  let lastUpdatedAt = tenant.draftUpdatedAt?.toISOString() ?? null;
  let lastHeartbeat = Date.now();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`));

      const intervalId = setInterval(async () => {
        if (request.signal.aborted) { clearInterval(intervalId); controller.close(); return; }
        try {
          const current = await prisma.tenant.findUnique({
            where: { id: tenant.id },
            select: { draftUpdatedAt: true, draftUpdatedBy: true },
          });
          if (!current) { clearInterval(intervalId); controller.close(); return; }

          const currentAt = current.draftUpdatedAt?.toISOString() ?? null;
          if (currentAt !== lastUpdatedAt) {
            lastUpdatedAt = currentAt;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "draft_updated", tenantId: tenant.id, updatedAt: currentAt, updatedBy: current.draftUpdatedBy })}\n\n`));
          }

          const now = Date.now();
          if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
            lastHeartbeat = now;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`));
          }
        } catch (err) { console.error("[SSE] Poll error:", err); }
      }, POLL_INTERVAL_MS);

      request.signal.addEventListener("abort", () => {
        clearInterval(intervalId);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
