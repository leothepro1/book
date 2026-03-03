"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import type { TenantConfig } from "../_lib/tenant/types";
import "./guest-footer.css";

type FooterKey = "home" | "stays" | "account";

function isActive(key: FooterKey, pathname: string) {
  // Preview mode routes
  if (pathname.startsWith("/preview")) {
    if (key === "home") return pathname === "/preview/home" || pathname === "/preview";
    if (key === "stays") return pathname.startsWith("/preview/stays");
    if (key === "account") return pathname.startsWith("/preview/account");
  }
  
  // Normal portal routes
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
    <path d="M8.75 2.75c0-.41-.34-.75-.75-.75s-.75.34-.75.75v2.33c-2.37.26-3.75 1.52-3.75 5.57v6.18C3.5 21.06 4.56 23 9.5 23h5c4.94 0 6-1.94 6-6.18V10.65c0-4.05-1.38-5.31-3.75-5.57V2.75c0-.41-.34-.75-.75-.75s-.75.34-.75.75V5h-6.5zM9 17.25h5c.41 0 .75-.34.75-.75s-.34-.75-.75-.75H9c-.41 0-.75.34-.75.75s.34.75.75.75m-2-4h8c.41 0 .75-.34.75-.75s-.34-.75-.75-.75H7c-.41 0-.75.34-.75.75s.34.75.75.75" fill="currentColor"/>
  </svg>
);

const AccountInactive = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10m0 2c-5.33 0-10 2.69-10 6v2h20v-2c0-3.31-4.67-6-10-6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
);

const AccountActive = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5m0 2c-3.87 0-10 1.94-10 6v2h20v-2c0-4.06-6.13-6-10-6" fill="currentColor"/>
  </svg>
);

export default function GuestFooter({ config }: { config: TenantConfig }) {
  const pathname = usePathname();
  const params = useParams<{ token?: string; slug?: string }>();
  
  // KRITISK FIX: Använd preview mode base OM vi är i /preview/
  const isPreviewMode = pathname.startsWith("/preview");
  const token = isPreviewMode ? "preview" : (params?.token ?? "");

  const items = useMemo(() => {
    const base = token === "preview" ? "/preview" : token ? `/p/${token}` : "/p";
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
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border)] bg-[var(--background)] p-[5px]">
      <div className="flex items-center justify-around">
        {items.map((item) => {
          const active = isActive(item.key, pathname);
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
