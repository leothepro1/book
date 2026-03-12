"use client";

import { useState, useEffect, useRef } from "react";
import { isCloudinaryUrl } from "./client";

/**
 * Fetch a signed video thumbnail URL from /api/media/thumb.
 * Returns null while loading or if the video is not a Cloudinary URL.
 *
 * Cloudinary has strict transformations enabled — unsigned transform URLs
 * return 401, so we must use a server-side signed URL.
 */
export function useVideoThumb(videoUrl: string): string | null {
  const [thumb, setThumb] = useState<string | null>(null);
  const urlRef = useRef(videoUrl);

  useEffect(() => {
    urlRef.current = videoUrl;

    if (!videoUrl || !isCloudinaryUrl(videoUrl)) {
      setThumb(null);
      return;
    }

    fetch(`/api/media/thumb?url=${encodeURIComponent(videoUrl)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`thumb API ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (urlRef.current === videoUrl && d.thumbUrl) {
          setThumb(d.thumbUrl);
        }
      })
      .catch((err) => {
        console.warn("[useVideoThumb] Failed to fetch poster:", err);
      });
  }, [videoUrl]);

  return thumb;
}
