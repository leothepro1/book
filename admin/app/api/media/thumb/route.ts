export const dynamic = "force-dynamic";

/**
 * Media API — Video Thumbnail
 *
 * GET /api/media/thumb?url=<cloudinary-video-url>
 *
 * Returns a signed Cloudinary thumbnail URL for a video.
 * Needed because strict transformations are enabled —
 * unsigned transform URLs return 401.
 */

import { NextRequest, NextResponse } from "next/server";
import { extractPublicId } from "@/app/_lib/cloudinary/client";
import { getSignedVideoThumbUrl } from "@/app/_lib/cloudinary/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    const publicId = extractPublicId(url);
    const thumbUrl = getSignedVideoThumbUrl(publicId);
    return NextResponse.json({ thumbUrl });
  } catch {
    return NextResponse.json({ error: "Failed to generate thumbnail" }, { status: 500 });
  }
}
