import "./guest.css";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function GuestLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
