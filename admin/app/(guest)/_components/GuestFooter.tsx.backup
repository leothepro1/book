"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { Home, CalendarDays, User } from "lucide-react";
import type { TenantConfig } from "../_lib/tenant/types";

type FooterKey = "home" | "stays" | "account";

function isActive(key: FooterKey, pathname: string) {
  // pathname examples:
  // /p/[token]
  // /p/[token]/stays
  // /p/[token]/account
  if (key === "home") return /\/p\/[^/]+$/.test(pathname);
  if (key === "stays") return /\/p\/[^/]+\/stays(\/|$)/.test(pathname);
  if (key === "account") return /\/p\/[^/]+\/account(\/|$)/.test(pathname);
  return false;
}

export default function GuestFooter({ config }: { config: TenantConfig }) {
  const pathname = usePathname() || "";
  const params = useParams<{ token?: string }>();
  const token = params?.token ?? "";

  const items = useMemo(() => {
    const base = token ? `/p/${token}` : "/p";
    return [
      {
        key: "home" as const,
        label: "Home",
        href: `${base}`,
        Icon: Home,
      },
      {
        key: "stays" as const,
        label: "Stays",
        href: `${base}/stays`,
        Icon: CalendarDays,
      },
      {
        key: "account" as const,
        label: "Account",
        href: `${base}/account`,
        Icon: User,
      },
    ];
  }, [token]);

  // NOTE: config används fortfarande (behåller signaturen och framtida möjlighet),
  // men ni bad om fast 3-items footer nu.
  void config;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border)] bg-[var(--background)]/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-around px-2 py-2">
        {items.map((item) => {
          const active = isActive(item.key, pathname);
          const color = active ? "#121212" : "rgba(0,0,0,0.549)";

          // Fylld ikon när aktiv: använd fill=currentColor, annars outline.
          // (Lucide är outline som default; vi sätter fill bara vid aktivt.)
          const Icon = item.Icon;

          return (
            <Link
              key={item.key}
              href={item.href}
              className="flex flex-1 flex-col items-center justify-center gap-1 py-2"
              style={{ color }}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                size={20}
                strokeWidth={2}
                style={{
                  color: "currentColor",
                  fill: active ? "currentColor" : "none",
                }}
              />
              <span className="text-[11px] font-semibold leading-none">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}