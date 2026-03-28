import "../../(guest)/guest.css";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { PreviewBridge } from "../_components/PreviewBridge";
import { ScreenshotMode } from "../_components/ScreenshotMode";

export default function PreviewLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <ScreenshotMode />
      </Suspense>
      <PreviewBridge />
      {children}
    </>
  );
}
