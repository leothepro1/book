export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { cloudinary } from "@/app/_lib/cloudinary/server";

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await getAuth();
    const tenantData = await getCurrentTenant();
    if (!tenantData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { tenant } = tenantData;

    const { publicId } = await req.json();
    if (!publicId) {
      return NextResponse.json({ error: "No publicId provided" }, { status: 400 });
    }

    if (!publicId.startsWith(`hospitality/${tenant.slug}/`)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await cloudinary.uploader.destroy(publicId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Delete] Error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
