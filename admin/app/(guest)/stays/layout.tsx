import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function StaysLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
