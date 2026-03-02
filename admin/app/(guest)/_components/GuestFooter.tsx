"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import type { TenantConfig } from "../_lib/tenant/types";
import "./guest-footer.css";

type FooterKey = "home" | "stays" | "account";

function isActive(key: FooterKey, pathname: string) {
  if (key === "home") return /\/p\/[^/]+$/.test(pathname);
  if (key === "stays") return /\/p\/[^/]+\/stays(\/|$)/.test(pathname);
  if (key === "account") return /\/p\/[^/]+\/account(\/|$)/.test(pathname);
  return false;
}

const HomeInactive = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 22h20" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2.95 22 3 9.97c0-.61.29-1.19.77-1.57l7-5.45a2.01 2.01 0 0 1 2.46 0l7 5.44c.49.38.77.96.77 1.58V22" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinejoin="round"/>
    <path d="M13 17h-2c-.83 0-1.5.67-1.5 1.5V22h5v-3.5c0-.83-.67-1.5-1.5-1.5Zm-3.5-3.25h-2c-.55 0-1-.45-1-1v-1.5c0-.55.45-1 1-1h2c.55 0 1 .45 1 1v1.5c0 .55-.45 1-1 1Zm7 0h-2c-.55 0-1-.45-1-1v-1.5c0-.55.45-1 1-1h2c.55 0 1 .45 1 1v1.5c0 .55-.45 1-1 1Z" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinejoin="round"/>
    <path d="m19 7-.03-3h-4.4" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const HomeActive = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22 21.249h-1V9.979c0-.62-.28-1.2-.77-1.58L19 7.439l-.02-2.45c0-.55-.45-.99-1-.99h-3.41l-1.34-1.04c-.72-.57-1.74-.57-2.46 0l-7 5.44c-.49.38-.77.96-.77 1.57l-.05 11.28H2c-.41 0-.75.34-.75.75s.34.75.75.75h20c.41 0 .75-.34.75-.75s-.34-.75-.75-.75m-15.5-8.5v-1.5c0-.55.45-1 1-1h2c.55 0 1 .45 1 1v1.5c0 .55-.45 1-1 1h-2c-.55 0-1-.45-1-1m8 8.5h-5v-2.75c0-.83.67-1.5 1.5-1.5h2c.83 0 1.5.67 1.5 1.5zm3-8.5c0 .55-.45 1-1 1h-2c-.55 0-1-.45-1-1v-1.5c0-.55.45-1 1-1h2c.55 0 1 .45 1 1z" fill="currentColor"/>
  </svg>
);

const StaysInactive = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 2v3m8-3v3m-9 8h8m-8 4h5m4-13.5c3.33.18 5 1.45 5 6.15v6.18c0 4.12-1 6.18-6 6.18H9c-5 0-6-2.06-6-6.18V9.65c0-4.7 1.67-5.96 5-6.15z" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const StaysActive = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8.29 6.29c-.42 0-.75-.34-.75-.75V2.75a.749.749 0 1 1 1.5 0v2.78c0 .42-.33.76-.75.76m7.42 0c-.42 0-.75-.34-.75-.75V2.75a.749.749 0 1 1 1.5 0v2.78c0 .42-.33.76-.75.76" fill="currentColor"/>
    <path d="M19.57 4.5c-.66-.49-1.61-.02-1.61.81v.1c0 1.17-.84 2.25-2.01 2.37-1.35.14-2.49-.92-2.49-2.24V4.5c0-.55-.45-1-1-1h-.92c-.55 0-1 .45-1 1v1.04c0 .79-.41 1.49-1.03 1.88-.09.06-.19.11-.29.16q-.135.075-.3.12c-.12.04-.25.07-.39.08q-.24.03-.48 0c-.14-.01-.27-.04-.39-.08q-.15-.045-.3-.12c-.1-.05-.2-.1-.29-.16-.63-.44-1.03-1.2-1.03-2.01v-.1c0-.77-.82-1.23-1.47-.9-.01.01-.02.01-.03.02-.04.02-.07.04-.11.07-.03.03-.07.05-.1.08-.28.22-.53.47-.74.74-.11.12-.2.25-.28.38a3.5 3.5 0 0 0-.27.46c-.02.02-.03.03-.03.05-.06.12-.12.24-.16.37-.03.05-.04.09-.06.14-.06.15-.1.3-.14.45-.04.14-.07.29-.09.44a6 6 0 0 0-.06.76v8.76A4.87 4.87 0 0 0 7.37 22h9.26a4.87 4.87 0 0 0 4.87-4.87V8.37c0-1.59-.76-2.98-1.93-3.87M12 17.42H7.36a.755.755 0 0 1 0-1.51H12c.42 0 .75.34.75.76 0 .41-.33.75-.75.75m2.78-3.71H7.36a.755.755 0 0 1 0-1.51h7.42c.42 0 .76.34.76.76 0 .41-.34.75-.76.75" fill="currentColor"/>
  </svg>
);

const AccountInactive = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10m8.59 10c0-3.87-3.85-7-8.59-7s-8.59 3.13-8.59 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const AccountActive = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10m0 2.5c-5.01 0-9.09 3.36-9.09 7.5 0 .28.22.5.5.5h17.18c.28 0 .5-.22.5-.5 0-4.14-4.08-7.5-9.09-7.5" fill="currentColor"/>
  </svg>
);

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
        IconInactive: HomeInactive,
        IconActive: HomeActive,
      },
      {
        key: "stays" as const,
        label: "Stays",
        href: `${base}/stays`,
        IconInactive: StaysInactive,
        IconActive: StaysActive,
      },
      {
        key: "account" as const,
        label: "Account",
        href: `${base}/account`,
        IconInactive: AccountInactive,
        IconActive: AccountActive,
      },
    ];
  }, [token]);

  void config;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border)] bg-[var(--background)]">
      <div className="mx-auto flex max-w-6xl items-center justify-around" style={{ padding: "8px 17px" }}>
        {items.map((item) => {
          const active = isActive(item.key, pathname);
          const color = active ? "#121212" : "rgba(0,0,0,0.549)";
          const Icon = active ? item.IconActive : item.IconInactive;

          return (
            <Link
              key={item.key}
              href={item.href}
              className={`footer-link flex flex-1 flex-col items-center justify-center gap-1 py-2 ${active ? "active" : ""}`}
              style={{ color: active ? undefined : "rgba(0,0,0,0.549)" }}
              aria-current={active ? "page" : undefined}
            >
              <div className="footer-icon">
                <Icon />
              </div>
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
