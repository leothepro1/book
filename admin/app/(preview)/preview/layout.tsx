import "../../(guest)/guest.css";
import type { ReactNode } from "react";
import { PreviewBridge } from "../_components/PreviewBridge";

export default function PreviewLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PreviewBridge />
      {children}
    </>
  );
}
