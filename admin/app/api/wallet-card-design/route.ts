import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/db/prisma";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import type { WalletBackgroundMode } from "@prisma/client";

const DEFAULT_RESPONSE = {
  backgroundMode: "SOLID" as const,
  backgroundColor: "#1a1a2e",
  gradientDirection: "down",
  backgroundImageUrl: null,
  overlayOpacity: 0.3,
  logoUrl: null,
  dateTextColor: "#ffffff",
};

function serialize(design: {
  backgroundMode: WalletBackgroundMode;
  backgroundColor: string | null;
  gradientDirection: string | null;
  backgroundImageUrl: string | null;
  overlayOpacity: number | null;
  logoUrl: string | null;
  dateTextColor: string;
}) {
  return {
    backgroundMode: design.backgroundMode,
    backgroundColor: design.backgroundColor,
    gradientDirection: design.gradientDirection,
    backgroundImageUrl: design.backgroundImageUrl,
    overlayOpacity: design.overlayOpacity,
    logoUrl: design.logoUrl,
    dateTextColor: design.dateTextColor,
  };
}

export async function GET() {
  try {
    const { orgId } = await getAuth();
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const design = await prisma.walletCardDesign.findUnique({
      where: { tenantId: tenant.id },
    });

    if (!design) {
      return NextResponse.json(DEFAULT_RESPONSE);
    }

    return NextResponse.json(serialize(design));
  } catch (err) {
    console.error("[wallet-card-design] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { orgId } = await getAuth();
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const body = await request.json();

    const validModes: WalletBackgroundMode[] = ["SOLID", "GRADIENT", "IMAGE"];
    const backgroundMode = validModes.includes(body.backgroundMode)
      ? body.backgroundMode
      : "SOLID";

    const data = {
      backgroundMode,
      backgroundColor: typeof body.backgroundColor === "string" ? body.backgroundColor : null,
      gradientDirection: typeof body.gradientDirection === "string" ? body.gradientDirection : "down",
      backgroundImageUrl: typeof body.backgroundImageUrl === "string" ? body.backgroundImageUrl : null,
      overlayOpacity: typeof body.overlayOpacity === "number" ? body.overlayOpacity : 0.3,
      logoUrl: typeof body.logoUrl === "string" ? body.logoUrl : null,
      dateTextColor: typeof body.dateTextColor === "string" ? body.dateTextColor : "#ffffff",
    };

    const design = await prisma.walletCardDesign.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, ...data },
      update: data,
    });

    return NextResponse.json(serialize(design));
  } catch (err) {
    console.error("[wallet-card-design] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
