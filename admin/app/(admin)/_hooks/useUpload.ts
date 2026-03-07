"use client";
import { useState, useCallback } from "react";
import { extractPublicId } from "@/app/_lib/cloudinary/client";

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;

export type UploadResult = {
  url: string;
  publicId: string;
  width: number;
  height: number;
};

async function makeThumbBlob(file: File, maxW = 400): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("thumb_failed")),
        "image/webp", 0.85
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("img_load")); };
    img.src = objectUrl;
  });
}

function uploadDirect(
  file: File | Blob,
  folder: string,
  onProgress?: (pct: number) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);
    formData.append("folder", folder);

    // Always use image/upload — Cloudinary handles PDFs as images (renders first page)
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress((e.loaded / e.total) * 100);
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({ url: data.secure_url, publicId: data.public_id, width: data.width, height: data.height });
        } catch (err) { reject(err); }
      } else {
        reject(new Error("Upload failed: " + xhr.status));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(formData);
  });
}

export function useUpload(folder = "hospitality/cards") {
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
      if (!file.type.startsWith("image/")) {
        // Non-image files (e.g. PDF): upload directly, no thumbnail
        // Cloudinary renders PDF first page — construct preview URL
        const result = await uploadDirect(file, folder);
        const previewUrl = result.url.replace("/upload/", "/upload/pg_1,w_600,f_jpg/");
        onPreview(previewUrl);
        onComplete(result);
        setIsUploading(false);
      } else {
        const thumbBlob = await makeThumbBlob(file, 400);
        const localUrl = URL.createObjectURL(thumbBlob);
        onPreview(localUrl);

        const thumbResult = await uploadDirect(thumbBlob, folder + "/thumbs");
        URL.revokeObjectURL(localUrl);
        onPreview(thumbResult.url);
        onComplete(thumbResult);
        setIsUploading(false);

        uploadDirect(file, folder).then((result) => {
          onComplete(result);
        }).catch(() => {});
      }
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
