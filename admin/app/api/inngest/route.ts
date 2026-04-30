/**
 * Inngest HTTP entrypoint — Next.js App Router serve handler.
 *
 * Inngest delivers events and invokes functions over HTTP. Inngest Cloud
 * (production) and the local Inngest dev server (`npx inngest-cli dev`)
 * both POST to this route. The handler exports GET (introspection /
 * sync), POST (event delivery / function step), and PUT (sync after
 * deploy) per Inngest's contract.
 *
 * Runtime: Node.js. Inngest's signature verification uses Node's crypto
 * primitives; the Edge runtime would silently drop signed-request
 * verification.
 *
 * Phase 1A registers an empty `functions` array — the analytics drainer
 * arrives in Phase 1B. The route still has to exist now so:
 *   - The Vercel Inngest integration can sync the app on first deploy.
 *   - The local `inngest-cli dev` server can detect the app id and
 *     route events to it during development.
 */

import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import {
  drainAnalyticsOutbox,
  scanAnalyticsOutbox,
} from "@/inngest/functions";

export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [drainAnalyticsOutbox, scanAnalyticsOutbox],
});
