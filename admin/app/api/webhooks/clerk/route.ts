export const dynamic = "force-dynamic";

import { headers } from 'next/headers';
import { Webhook } from 'svix';
import { prisma } from '@/app/_lib/db/prisma';
import { env } from '@/app/_lib/env';
import { generatePortalSlug, tenantDefaultEmailFrom } from '@/app/_lib/tenant/portal-slug';
import { generateAnalyticsSalt } from '@/app/_lib/analytics/pipeline/tenant-settings';

const webhookSecret = env.CLERK_WEBHOOK_SECRET;

export async function POST(req: Request) {
  const headersList = await headers();
  const svix_id = headersList.get('svix-id');
  const svix_timestamp = headersList.get('svix-timestamp');
  const svix_signature = headersList.get('svix-signature');

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error: Missing svix headers', { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(webhookSecret);
  let evt: any;

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    });
  } catch (err) {
    console.error('Error: Webhook verification failed', err);
    return new Response('Error: Verification failed', { status: 400 });
  }

  // ── Idempotency: check if this event was already processed ──
  const existing = await prisma.webhookEvent.findUnique({
    where: { id: svix_id },
  });
  if (existing) {
    return new Response('Already processed', { status: 200 });
  }

  const eventType: string = evt.type;

  // ── Process event inside a transaction with idempotency record ──
  try {
    await prisma.$transaction(async (tx) => {
      // Double-check inside transaction (race condition guard)
      const alreadyProcessed = await tx.webhookEvent.findUnique({
        where: { id: svix_id },
      });
      if (alreadyProcessed) return;

      if (eventType === 'organization.created') {
        const { id, name, slug, created_by } = evt.data;
        const portalSlug = await generatePortalSlug(name);
        const emailFrom = tenantDefaultEmailFrom(portalSlug);
        // Mint per-tenant analytics salt at creation time so new
        // tenants never need the Phase 2 backfill. The salt is a
        // namespace separator for user_agent_hash construction —
        // not cryptographic-secret in the strong sense, but per-
        // tenant rotation matters and minting at creation is the
        // cheapest path to that.
        const analyticsSalt = await generateAnalyticsSalt();
        const newTenant = await tx.tenant.create({
          data: {
            clerkOrgId: id,
            name: name,
            slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
            ownerClerkUserId: created_by,
            portalSlug,
            emailFrom,
            settings: getDefaultTenantSettings(name, analyticsSalt),
          },
        });

        // Seed default guest segments
        const { seedDefaultSegments } = await import("@/app/_lib/segments/defaults");
        await seedDefaultSegments(newTenant.id, tx);
      }

      // Double-write strategy: updateClerkOrgName() in organisation/actions.ts
      // writes to both Clerk and DB directly for immediate UI consistency.
      // This webhook handler serves as a safety net — it syncs changes made
      // outside our app (e.g. Clerk Dashboard) and provides eventual consistency
      // in multi-instance deployments. The duplicate write is idempotent and safe.
      if (eventType === 'organization.updated') {
        const { id, name, slug } = evt.data;
        await tx.tenant.update({
          where: { clerkOrgId: id },
          data: {
            name,
            ...(slug ? { slug } : {}),
          },
        });
      }

      if (eventType === 'organization.deleted') {
        const { id } = evt.data;
        await tx.tenant.delete({
          where: { clerkOrgId: id },
        });
      }

      // Record this event as processed
      await tx.webhookEvent.create({
        data: { id: svix_id, eventType },
      });
    });
  } catch (err) {
    console.error(`[Webhook] Error processing ${eventType}:`, err);
    return new Response('Error: Processing failed', { status: 500 });
  }

  return new Response('Webhook received', { status: 200 });
}

function getDefaultTenantSettings(name: string, analyticsSalt: string) {
  return {
    property: {
      name,
      address: "",
      latitude: 0,
      longitude: 0,
      checkInTime: "14:00",
      checkOutTime: "11:00",
      timezone: "Europe/Stockholm",
    },
    theme: {
      version: 1,
      colors: {
        background: "#fff",
        text: "#2D2C2B",
        buttonBg: "#8B3DFF",
        buttonText: "#fff",
      },
      header: { logoUrl: undefined, logoWidth: 120 },
      background: { mode: "fill" },
      buttons: { variant: "solid", radius: "rounder", shadow: "soft" },
      typography: { headingFont: "inter", bodyFont: "inter", mutedOpacity: 0.72 },
    },
    supportLinks: {},
    features: {
      commerceEnabled: false,
      accountEnabled: false,
      notificationsEnabled: true,
      languageSwitcherEnabled: true,
    },
    // Per-tenant analytics salt. Read by getAnalyticsSalt() server-
    // side and injected into the storefront via SSR for the loader's
    // user_agent_hash construction. See
    // app/_lib/analytics/pipeline/tenant-settings.ts for the full
    // contract.
    analyticsSalt,
  };
}
