import { headers } from 'next/headers';
import { Webhook } from 'svix';
import { prisma } from '@/app/_lib/db/prisma';

const webhookSecret = process.env.CLERK_WEBHOOK_SECRET || '';

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

  const eventType = evt.type;

  // Handle organization.created event
  if (eventType === 'organization.created') {
    const { id, name, slug, created_by } = evt.data;
    
    console.log('📝 Organization created:', name);

    // Skapa tenant i databasen
    await prisma.tenant.create({
      data: {
        clerkOrgId: id,
        name: name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        ownerClerkUserId: created_by,
        settings: getDefaultTenantSettings(name),
      },
    });

    console.log('✅ Tenant synced to database');
  }

  // Handle organization.updated event
  if (eventType === 'organization.updated') {
    const { id, name } = evt.data;
    
    console.log('📝 Organization updated:', name);

    await prisma.tenant.update({
      where: { clerkOrgId: id },
      data: { name },
    });

    console.log('✅ Tenant updated');
  }

  // Handle organization.deleted event
  if (eventType === 'organization.deleted') {
    const { id } = evt.data;
    
    console.log('📝 Organization deleted:', id);

    // Soft delete eller hard delete beroende på din policy
    await prisma.tenant.delete({
      where: { clerkOrgId: id },
    });

    console.log('✅ Tenant deleted');
  }

  return new Response('Webhook received', { status: 200 });
}

function getDefaultTenantSettings(name: string) {
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
  };
}
