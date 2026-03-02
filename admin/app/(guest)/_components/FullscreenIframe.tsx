"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppLoader from "./AppLoader";

type Props = {
  url: string;
  title: string;
};

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M15 18l-6-6 6-6" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
);

export default function FullscreenIframe({ url, title }: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Header height = 56px (samma som modal header)
  // Footer height = ~70px
  const headerHeight = 56;
  const footerHeight = 70;

  const handleBack = () => {
    router.back();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: `${footerHeight}px`,
        width: "100vw",
        maxWidth: "100vw",
        background: "var(--background)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        margin: 0,
        padding: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          height: headerHeight,
          width: "100%",
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid var(--border)",
          background: "var(--background)",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={handleBack}
          aria-label="Tillbaka"
          style={{
            height: headerHeight,
            width: headerHeight,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text)",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          <div style={{ width: 24, height: 24 }}>
            <BackIcon />
          </div>
        </button>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, position: "relative", width: "100%", overflow: "hidden" }}>
        {/* Loading overlay */}
        {isLoading && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--background)",
              zIndex: 51,
            }}
          >
            <AppLoader size={96} colorVar="--text" ariaLabel="Laddar innehåll" />
          </div>
        )}

        {/* Iframe */}
        <iframe
          src={url}
          title={title}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            display: "block",
          }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onLoad={() => setIsLoading(false)}
        />
      </div>
    </div>
  );
}
