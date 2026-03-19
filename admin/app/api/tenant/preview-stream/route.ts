import { NextRequest } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";

const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 30000;

export async function GET(request: NextRequest) {
  const { orgId } = await getAuth();

  if (!orgId) return new Response("Unauthorized", { status: 401 });

  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true, draftUpdatedAt: true, settingsVersion: true },
  });

  if (!tenant) return new Response("Tenant not found", { status: 404 });

  const encoder = new TextEncoder();
  let lastUpdatedAt = tenant.draftUpdatedAt?.toISOString() ?? null;
  let lastVersion = tenant.settingsVersion;
  let lastHeartbeat = Date.now();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`));

      const intervalId = setInterval(async () => {
        if (request.signal.aborted) { clearInterval(intervalId); controller.close(); return; }
        try {
          const current = await prisma.tenant.findUnique({
            where: { id: tenant.id },
            select: { draftUpdatedAt: true, draftUpdatedBy: true, settingsVersion: true },
          });
          if (!current) { clearInterval(intervalId); controller.close(); return; }

          const currentAt = current.draftUpdatedAt?.toISOString() ?? null;
          const versionChanged = current.settingsVersion !== lastVersion;
          if (currentAt !== lastUpdatedAt || versionChanged) {
            lastUpdatedAt = currentAt;
            lastVersion = current.settingsVersion;
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
