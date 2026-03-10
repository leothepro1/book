/**
 * Media API — List & Upload
 *
 * GET  /api/media?folder=cards&search=logo&cursor=xxx&limit=50
 * POST /api/media (multipart form data)
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import {
  uploadMedia,
  listMedia,
  MediaError,
} from "@/app/_lib/media";
import type { MediaQuery } from "@/app/_lib/media";

// ─── GET: List/Search Media ─────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const tenantData = await getCurrentTenant();
    if (!tenantData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const query: MediaQuery = {
      folder: searchParams.get("folder") ?? undefined,
      mimeType: searchParams.get("mimeType") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.has("limit") ? Number(searchParams.get("limit")) : undefined,
      orderBy: (searchParams.get("orderBy") as MediaQuery["orderBy"]) ?? undefined,
      orderDir: (searchParams.get("orderDir") as MediaQuery["orderDir"]) ?? undefined,
    };

    const page = await listMedia(tenantData.tenant.id, query);
    return NextResponse.json(page);
  } catch (error) {
    console.error("[Media API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch media" },
      { status: 500 }
    );
  }
}

// ─── POST: Upload Media ─────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuth();
    const tenantData = await getCurrentTenant();
    if (!tenantData || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) ?? "general";
    const alt = (formData.get("alt") as string) ?? undefined;
    const title = (formData.get("title") as string) ?? undefined;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const result = await uploadMedia({
      tenant: tenantData.tenant,
      userId,
      file,
      folder,
      alt,
      title,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof MediaError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    console.error("[Media API] POST error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
