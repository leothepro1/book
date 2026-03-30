"use client";

/**
 * AnalyticsProvider — wraps guest portal, auto-tracks PAGE_VIEWED on route changes.
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { track, trackSessionEnd } from "@/app/_lib/analytics/client";

type Props = {
  tenantId: string;
  children: React.ReactNode;
};

export function AnalyticsProvider({ tenantId, children }: Props) {
  const pathname = usePathname();
  const prevPathname = useRef<string | null>(null);

  // Track PAGE_VIEWED on every route change
  useEffect(() => {
    track({
      tenantId,
      eventType: "PAGE_VIEWED",
      payload: {
        page: pathname,
        previousPage: prevPathname.current,
      },
    });
    prevPathname.current = pathname;
  }, [pathname, tenantId]);

  // Track SESSION_ENDED on page unload
  useEffect(() => {
    const handleUnload = () => trackSessionEnd(tenantId);
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") trackSessionEnd(tenantId);
    };

    window.addEventListener("beforeunload", handleUnload);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [tenantId]);

  return <>{children}</>;
}
