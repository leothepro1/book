export const dynamic = "force-dynamic";

/**
 * Media API — Index
 *
 * POST /api/media/index
 *
 * Registers an already-uploaded Cloudinary asset in the media library.
 * Used when uploads go through the existing direct-to-Cloudinary flow
 * (unsigned upload preset) and need to be indexed in the DB afterward.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/app/(admin)/_lib/tenant/getCurrentTenant";
import { getAuth } from "@/app/(admin)/_lib/auth/devAuth";
import { getCloudinaryResource, ensureCloudinaryFolder, buildTenantFolder } from "@/app/_lib/media/cloudinary-service";
import { createMediaAsset, getMediaAssetByPublicId, countMediaAssets } from "@/app/_lib/media/media-repository";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuth();
    const tenantData = await getCurrentTenant();
    if (!tenantData || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { tenant } = tenantData;

    const body = await req.json();
    const { url, publicId, folder = "general", resourceType: hintResourceType } = body as {
      url?: string;
      publicId?: string;
      folder?: string;
      resourceType?: string;
    };

    if (!publicId || !url) {
      return NextResponse.json({ error: "publicId and url are required" }, { status: 400 });
    }

    // Security: verify the publicId belongs to this tenant
    if (!publicId.startsWith(`hospitality/${tenant.slug}/`)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if already indexed
    const existing = await getMediaAssetByPublicId(publicId, tenant.id);
    if (existing) {
      return NextResponse.json({ id: existing.id, alreadyIndexed: true });
    }

    // Folder provisioning: only on first-ever asset for this tenant.
    // If tenant has 0 assets → create the root Cloudinary folder.
    // If tenant already has assets → folder exists, never touch it.
    const assetCount = await countMediaAssets(tenant.id);
    if (assetCount === 0) {
      try {
        await ensureCloudinaryFolder(buildTenantFolder(tenant.slug));
      } catch (err) {
        console.warn("[Media Index] Folder provisioning failed (non-fatal):", err);
      }
    }

    // Fetch metadata from Cloudinary to get accurate dimensions/size
    // Use hint to determine resource type (video uploads use different endpoint)
    const fetchResourceType = hintResourceType || (url.match(/\.(mp4|webm|mov|avi|mkv)(\?|$)/i) ? "video" : "image");
    const resource = await getCloudinaryResource(publicId, fetchResourceType);

    // Extract filename from publicId (last segment without folder path)
    const segments = publicId.split("/");
    const filename = segments[segments.length - 1] || "untitled";

    // Determine format and mime type
    // For raw resources (PDFs), Cloudinary may not return format — infer from filename
    const format = resource?.format || filename.split(".").pop() || url.split(".").pop()?.split("?")[0] || "unknown";
    const mimeType = inferMimeType(format);

    const asset = await createMediaAsset({
      tenantId: tenant.id,
      publicId,
      url,
      resourceType: resource?.resource_type || "image",
      filename,
      mimeType,
      bytes: resource?.bytes || 0,
      width: resource?.width || null,
      height: resource?.height || null,
      format,
      folder,
      alt: "",
      title: "",
      uploadedBy: userId,
    });

    return NextResponse.json({ id: asset.id }, { status: 201 });
  } catch (error) {
    console.error("[Media Index] Error:", error);
    return NextResponse.json({ error: "Indexing failed" }, { status: 500 });
  }
}

function inferMimeType(format: string): string {
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
    gif: "image/gif",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
  };
  return map[format.toLowerCase()] || `image/${format}`;
}
