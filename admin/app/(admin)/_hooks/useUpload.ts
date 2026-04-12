"use client";
import { useState, useCallback } from "react";
import { extractPublicId } from "@/app/_lib/cloudinary/client";

export type UploadResult = {
  url: string;
  publicId: string;
  width: number;
  height: number;
};

/**
 * Upload a file via the server-side /api/media endpoint.
 * The server handles Cloudinary upload with signed credentials.
 */
async function uploadViaServer(
  file: File | Blob,
  folder: string,
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);

  const res = await fetch("/api/media", { method: "POST", body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Upload failed: ${res.status}`);
  }
  const data = await res.json();
  return { url: data.url, publicId: data.publicId, width: data.width, height: data.height };
}

export function useUpload(folder = "general") {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (
    file: File,
    onPreview: (localUrl: string) => void,
    onComplete: (result: UploadResult) => void,
    onError?: (msg: string) => void
  ) => {
    setIsUploading(true);
    setError(null);

    try {
      // Show local preview immediately while uploading
      const localUrl = URL.createObjectURL(file);
      onPreview(localUrl);

      const result = await uploadViaServer(file, folder);

      URL.revokeObjectURL(localUrl);
      onPreview(result.url);
      onComplete(result);
      setIsUploading(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      setIsUploading(false);
      onError?.(msg);
    }
  }, [folder]);

  const deleteImage = useCallback(async (urlOrPublicId: string): Promise<boolean> => {
    try {
      const publicId = urlOrPublicId.includes("cloudinary.com")
        ? extractPublicId(urlOrPublicId)
        : urlOrPublicId;
      const res = await fetch("/api/tenant/upload/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId }),
      });
      return res.ok;
    } catch { return false; }
  }, []);

  return { isUploading, error, upload, deleteImage };
}
