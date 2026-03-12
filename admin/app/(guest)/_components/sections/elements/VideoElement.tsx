"use client";

import { useState, useRef, useCallback } from "react";
import type { ResolvedElement } from "@/app/_lib/sections/types";
import { useVideoThumb } from "@/app/_lib/cloudinary/useVideoThumb";

export function VideoElement({ resolved }: { resolved: ResolvedElement }) {
  const { settings } = resolved;
  const src = settings.src as string;
  const autoplay = (settings.autoplay as boolean) ?? false;
  const width = (settings.width as number) ?? 100;
  const height = (settings.height as number) ?? 300;
  const radiusTopLeft = (settings.radiusTopLeft as number) ?? 0;
  const radiusTopRight = (settings.radiusTopRight as number) ?? 0;
  const radiusBottomRight = (settings.radiusBottomRight as number) ?? 0;
  const radiusBottomLeft = (settings.radiusBottomLeft as number) ?? 0;

  const borderRadius = `${radiusTopLeft}px ${radiusTopRight}px ${radiusBottomRight}px ${radiusBottomLeft}px`;

  // Use original URL for video src (always works), signed URL for poster
  const posterSrc = useVideoThumb(src);

  if (!src) {
    return (
      <div
        style={{
          width: `${width}%`,
          height: height > 0 ? height : undefined,
          minHeight: 120,
          background: "#F1F0EE",
          borderRadius,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#999",
          fontSize: 14,
        }}
      >
        Ingen video vald
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        width: `${width}%`,
        height: height > 0 ? height : undefined,
        borderRadius,
        overflow: "hidden",
      }}
    >
      {autoplay ? (
        <AutoplayVideo src={src} poster={posterSrc} />
      ) : (
        <ClickToPlayVideo src={src} poster={posterSrc} />
      )}
    </div>
  );
}

/**
 * Autoplay video — muted, loops, no controls.
 * Best for background/ambient video.
 */
function AutoplayVideo({ src, poster }: { src: string; poster: string | null }) {
  const [videoReady, setVideoReady] = useState(false);

  return (
    <>
      {poster && !videoReady && (
        <img
          src={poster}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      )}
      <video
        src={src}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onPlaying={() => setVideoReady(true)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
    </>
  );
}

/**
 * Click-to-play video — shows poster with a play button overlay.
 * On click, starts playback with controls visible.
 */
function ClickToPlayVideo({ src, poster }: { src: string; poster: string | null }) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlay = useCallback(() => {
    setPlaying(true);
    requestAnimationFrame(() => {
      videoRef.current?.play().catch(() => {});
    });
  }, []);

  const handleEnded = useCallback(() => {
    setPlaying(false);
  }, []);

  return (
    <>
      {/* Poster image shown before play — more reliable than <video poster> */}
      {poster && !playing && (
        <img
          src={poster}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            zIndex: 0,
          }}
        />
      )}
      <video
        ref={videoRef}
        src={playing ? src : undefined}
        playsInline
        preload="metadata"
        controls={playing}
        onEnded={handleEnded}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          position: playing ? "relative" : "absolute",
          opacity: playing ? 1 : 0,
        }}
      />
      {!playing && (
        <button
          type="button"
          onClick={handlePlay}
          aria-label="Spela upp video"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0, 0, 0, 0.2)",
            border: "none",
            cursor: "pointer",
            padding: 0,
            zIndex: 1,
          }}
        >
          <span
            className="material-symbols-rounded"
            style={{
              fontSize: 64,
              color: "#fff",
              fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 48",
              filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.3))",
            }}
          >
            play_circle
          </span>
        </button>
      )}
    </>
  );
}
