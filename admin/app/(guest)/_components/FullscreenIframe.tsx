"use client";

type Props = {
  url: string;
  title: string;
};

export default function FullscreenIframe({ url, title }: Props) {
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
      <iframe
        src={url}
        title={title}
        style={{
          width: "100%",
          height: "100%",
          border: "none"
        }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}
