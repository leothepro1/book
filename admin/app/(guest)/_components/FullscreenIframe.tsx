"use client";

import { useState } from "react";

type Props = {
  url: string;
  title: string;
};

export default function FullscreenIframe({ url, title }: Props) {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div style={{ 
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      background: "var(--background)",
      zIndex: 1000
    }}>
      {isLoading && (
        <div style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
          color: "var(--text)"
        }}>
          <div className="spinner" style={{ transform: "scale(1.5)" }} />
          <div style={{ marginTop: 16, opacity: 0.7 }}>Laddar {title}...</div>
        </div>
      )}
      
      <iframe
        src={url}
        title={title}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          opacity: isLoading ? 0 : 1,
          transition: "opacity 0.3s ease"
        }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        onLoad={() => setIsLoading(false)}
      />
    </div>
  );
}
