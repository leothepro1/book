import "./guest.css";
import type { ReactNode } from "react";
import { GclidCapture } from "./_components/GclidCapture";
import { UtmCapture } from "./_components/UtmCapture";

export const dynamic = "force-dynamic";

export default function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <GclidCapture />
      <UtmCapture />
      {children}
    </>
  );
}
