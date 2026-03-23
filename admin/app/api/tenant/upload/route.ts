export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { cloudinary } from "@/app/_lib/cloudinary/server";
import type { CloudinaryUploadResult } from "@/app/_lib/cloudinary/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "application/pdf"];

export async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuth();
    const tenantData = await getCurrentTenant();
    if (!tenantData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { tenant } = tenantData;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) ?? "cards";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    // Convert to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const isPdf = file.type === "application/pdf";

    // Wallpaper images: aggressive optimization (max 2000px, strip metadata)
    // Card images: standard quality optimization
    const isWallpaper = folder === "wallpaper";
    const transformation = isPdf ? undefined : isWallpaper
      ? [
          { width: 2000, crop: "limit" as const },
          { quality: "auto:low" as const, fetch_format: "auto" as const },
          { flags: "strip_profile" as const },
        ]
      : [{ quality: "auto" as const, fetch_format: "auto" as const }];

    // Upload to Cloudinary
    const result = await new Promise<CloudinaryUploadResult>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: `hospitality/${tenant.slug}/${folder}`,
          resource_type: "image",
          ...(transformation && { transformation }),
          ...(isWallpaper && { eager: [
            { width: 1200, crop: "limit", quality: "auto:low", fetch_format: "auto" },
            { width: 640, crop: "limit", quality: "auto:low", fetch_format: "auto" },
          ]}),
          tags: [tenant.slug, folder, userId ?? "dev"],
        },
        (error, result) => {
          if (error || !result) reject(error ?? new Error("Upload failed"));
          else resolve(result as CloudinaryUploadResult);
        }
      ).end(buffer);
    });

    return NextResponse.json({
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
    });
  } catch (error) {
    console.error("[Upload] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
