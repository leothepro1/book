"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import "./account-sidebar.css";

const ACCOUNT_NAV = [
  { href: "/account", label: "Mitt konto", icon: "person" },
  { href: "/account/orders", label: "Bokningar", icon: "confirmation_number" },
] as const;

export function AccountSidebar() {
  const pathname = usePathname();

  return (
    <nav className="as">
      {ACCOUNT_NAV.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`as__item${isActive ? " as__item--active" : ""}`}
          >
            <span
              className="material-symbols-rounded"
              style={{
                fontSize: 20,
                fontVariationSettings: `'FILL' ${isActive ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 20`,
              }}
            >
              {item.icon}
            </span>
            <span className="as__label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
