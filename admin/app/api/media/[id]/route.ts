export const dynamic = "force-dynamic";

/**
 * Media API — Single Asset Operations
 *
 * GET    /api/media/[id]
 * PATCH  /api/media/[id]  { alt, title, folder }
 * DELETE /api/media/[id]
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import {
  getMedia,
  updateMedia,
  deleteMedia,
} from "@/app/_lib/media";

type RouteParams = { params: Promise<{ id: string }> };

// ─── GET: Single Asset ──────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const tenantData = await getCurrentTenant();
    if (!tenantData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const asset = await getMedia(id, tenantData.tenant.id);
    if (!asset) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(asset);
  } catch (error) {
    console.error("[Media API] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch asset" }, { status: 500 });
  }
}

// ─── PATCH: Update Metadata ─────────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const tenantData = await getCurrentTenant();
    if (!tenantData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { alt, title, folder } = body as {
      alt?: string;
      title?: string;
      folder?: string;
    };

    const updated = await updateMedia({
      id,
      tenantId: tenantData.tenant.id,
      ...(alt !== undefined && { alt }),
      ...(title !== undefined && { title }),
      ...(folder !== undefined && { folder }),
    });

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[Media API] PATCH error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

// ─── DELETE: Soft Delete ────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { userId } = await getAuth();
    const tenantData = await getCurrentTenant();
    if (!tenantData || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const deleted = await deleteMedia(id, tenantData.tenant.id, userId);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Media API] DELETE error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
