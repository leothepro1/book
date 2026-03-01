"use client";

import { useEffect, useState } from "react";
import FullscreenIframe from "../../../_components/FullscreenIframe";

export default function HelpCenterPage() {
  const [faqUrl, setFaqUrl] = useState<string | null>(null);

  useEffect(() => {
    // Hämta URL från config via API eller använd default
    setFaqUrl("https://apelviken.se/faq");
  }, []);

  if (!faqUrl) {
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

  return <FullscreenIframe url={faqUrl} title="Hjälpcenter" />;
}
