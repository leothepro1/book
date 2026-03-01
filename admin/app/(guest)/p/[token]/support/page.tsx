"use client";

import { useEffect, useState } from "react";
import FullscreenIframe from "../../../_components/FullscreenIframe";

export default function SupportPage() {
  const [supportUrl, setSupportUrl] = useState<string | null>(null);

  useEffect(() => {
    // Hämta URL från config via API eller använd default
    setSupportUrl("https://apelviken.se/support");
  }, []);

  if (!supportUrl) {
    return (
      <div style={{ 
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)"
      }}>
        <div className="spinner" style={{ transform: "scale(1.5)" }} />
      </div>
    );
  }

  return <FullscreenIframe url={supportUrl} title="Kundservice" />;
}
