"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import type { TenantConfig, MenuConfig, MenuItemConfig } from "../_lib/tenant/types";
import { PAGE_FOOTER_DEFAULTS } from "../_lib/tenant/types";
import type { ColorScheme } from "@/app/_lib/color-schemes/types";
import type { ElementInstance } from "@/app/_lib/sections/types";
import { resolvePageIdFromPathname, getPageLayout, getPageFooter } from "@/app/_lib/pages";
import "./guest-footer.css";

// ─── Icon mapping — same icons as LinkPicker ─────────────────

/** Map a menu item URL to a Material Symbol name, mirroring LinkPicker exactly */
function resolveIcon(url: string): string {
  // Pages (same as LinkPicker > Sidor)
  if (url === "/") return "home";
  if (url === "/stays") return "calendar_today";
  if (url === "/account") return "face";

  // Element links (same as LinkPicker > Element)
  if (url.startsWith("#map:")) return "map";
  if (url.startsWith("#text:")) return "text_fields";
  if (url.includes(".pdf") || url.startsWith("#doc:")) return "document_scanner";

  // Contact (same as LinkPicker > Kontakt)
  if (url.startsWith("mailto:")) return "mail";
  if (url.startsWith("tel:")) return "phone";

  // Social media (same as LinkPicker > Sociala medier)
  if (url.includes("instagram.com")) return "photo_camera";
  if (url.includes("facebook.com")) return "group";
  if (url.includes("x.com") || url.includes("twitter.com")) return "tag";
  if (url.includes("linkedin.com")) return "work";

  // External URL fallback
  if (url.startsWith("http")) return "open_in_new";

  return "link";
}

// ─── URL helpers ─────────────────────────────────────────────

function isInternalPath(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("#");
}

function isSpecialLink(url: string): boolean {
  return url.startsWith("#map:") || url.startsWith("#text:");
}

function resolveMenuItemHref(url: string, base: string): string {
  if (isSpecialLink(url)) return url;
  if (!isInternalPath(url)) return url;
  if (url === "/") return base;
  return `${base}${url}`;
}

function isMenuItemActive(url: string, pathname: string, base: string): boolean {
  if (!isInternalPath(url)) return false;
  const fullHref = resolveMenuItemHref(url, base);
  if (url === "/") return pathname === fullHref || pathname === fullHref + "/home";
  return pathname.startsWith(fullHref);
}

// ─── Legacy active check (backward compat, no menu selected) ─

type FooterKey = "home" | "stays" | "account";

function isLegacyActive(key: FooterKey, pathname: string) {
  if (pathname.startsWith("/preview")) {
    if (key === "home") return pathname === "/preview/home" || pathname === "/preview";
    if (key === "stays") return pathname.startsWith("/preview/stays");
    if (key === "account") return pathname.startsWith("/preview/account");
  }
  if (key === "home") return /\/p\/[^/]+$/.test(pathname);
  if (key === "stays") return /\/p\/[^/]+\/stays(\/|$)/.test(pathname);
  if (key === "account") return /\/p\/[^/]+\/account(\/|$)/.test(pathname);
  return false;
}

// ─── Legacy default items ────────────────────────────────────

const LEGACY_ITEMS: { key: FooterKey; label: string; url: string; icon: string }[] = [
  { key: "home", label: "Home", url: "/", icon: "home" },
  { key: "stays", label: "Stays", url: "/stays", icon: "calendar_today" },
  { key: "account", label: "Account", url: "/account", icon: "face" },
];

// ─── Component ───────────────────────────────────────────────

export default function GuestFooter({ config }: { config: TenantConfig }) {
  const pathname = usePathname();
  const params = useParams<{ token?: string; slug?: string }>();

  const pageId = useMemo(() => resolvePageIdFromPathname(pathname), [pathname]);
  const pageLayout = useMemo(() => getPageLayout(pageId), [pageId]);

  const isPreviewMode = pathname.startsWith("/preview");
  const token = isPreviewMode ? "preview" : (params?.token ?? "");
  const base = token === "preview" ? "/preview" : token ? `/p/${token}` : "/p";

  const ftr = { ...PAGE_FOOTER_DEFAULTS, ...getPageFooter(config, pageId) };

  // Resolve menu from the menu element in classicGroups (single source of truth)
  const selectedMenu: MenuConfig | undefined = useMemo(() => {
    const groups = ftr.classicGroups;
    if (!groups || !config.menus) return undefined;
    const menuEl = groups.top.find((el) => el.type === "menu" && el.isActive !== false);
    if (!menuEl) return undefined;
    const menuId = typeof menuEl.settings.menu_id === "string" ? menuEl.settings.menu_id : "";
    if (!menuId) return undefined;
    return config.menus.find((m) => m.id === menuId);
  }, [ftr.classicGroups, config.menus]);

  // Color scheme CSS vars
  const schemeCssVars = useMemo(() => {
    if (!ftr.colorSchemeId || !config.colorSchemes) return undefined;
    const scheme = (config.colorSchemes as ColorScheme[]).find((s) => s.id === ftr.colorSchemeId);
    if (!scheme) return undefined;
    const t = scheme.tokens ?? {} as Record<string, string>;
    return {
      "--footer-bg": t.background ?? "#ffffff",
      "--footer-text": t.text ?? "#000000",
      "--footer-active": t.solidButtonBackground ?? t.text ?? "#000000",
      "--footer-divider": t.outlineButton ?? t.text ?? "#000000",
    } as React.CSSProperties;
  }, [ftr.colorSchemeId, config.colorSchemes]);

  const navStyle: React.CSSProperties = {
    ...schemeCssVars,
    paddingTop: ftr.paddingTop,
    paddingRight: ftr.paddingRight,
    paddingBottom: ftr.paddingBottom,
    paddingLeft: ftr.paddingLeft,
    backgroundColor: "var(--footer-bg, var(--background))",
    ...(ftr.showDivider
      ? { borderTop: `1px solid var(--footer-divider, color-mix(in srgb, var(--footer-text, var(--text)) 12%, transparent))` }
      : { borderTop: "none" }),
  };

  // ── Early returns (after all hooks) ──
  if (!pageLayout.footer) return null;
  if (ftr.isActive === false) return null;

  // ── App layout with selected menu ──
  if (ftr.footerLayout === "app" && selectedMenu) {
    const count = selectedMenu.items.length;
    const scrollable = count > 3;

    return (
      <nav className="fixed bottom-0 left-0 right-0 z-40" style={navStyle}>
        <div
          className={scrollable ? "footer-items footer-items--scroll" : "footer-items"}
          style={!scrollable ? { display: "flex" } : undefined}
        >
          {selectedMenu.items.map((item) => (
            <AppFooterItem
              key={item.id}
              item={item}
              pathname={pathname}
              base={base}
              count={count}
            />
          ))}
        </div>
      </nav>
    );
  }

  // ── Classic (footer) layout ──
  if (ftr.footerLayout === "classic") {
    const groups = ftr.classicGroups;
    const topElements = (groups?.top ?? []).filter((el) => el.isActive !== false).sort((a, b) => a.sortOrder - b.sortOrder);
    const bottomElements = (groups?.bottom ?? []).filter((el) => el.isActive !== false).sort((a, b) => a.sortOrder - b.sortOrder);

    return (
      <footer className="classic-footer" style={navStyle}>
        {topElements.length > 0 && (
          <div className="classic-footer__group">
            {topElements.map((el) => (
              <ClassicFooterElement key={el.id} element={el} config={config} />
            ))}
          </div>
        )}
        {bottomElements.length > 0 && (
          <div className="classic-footer__group">
            {bottomElements.map((el) => (
              <ClassicFooterElement key={el.id} element={el} config={config} />
            ))}
          </div>
        )}
      </footer>
    );
  }

  // ── App layout with legacy hardcoded tabs (no menu selected) ──
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40" style={navStyle}>
      <div className="flex items-center justify-around">
        {LEGACY_ITEMS.map((item) => {
          const active = isLegacyActive(item.key, pathname);
          const href = resolveMenuItemHref(item.url, base);

          const cls = [
            "footer-link flex flex-1 flex-col items-center justify-center gap-1 py-2",
            active ? "active" : "",
          ].filter(Boolean).join(" ");

          return (
            <Link
              key={item.key}
              href={href}
              className={cls}
              style={{ color: active ? undefined : "var(--footer-text, rgba(0,0,0,0.549))" }}
              aria-current={active ? "page" : undefined}
            >
              <div className="footer-icon">
                <span
                  className="material-symbols-rounded"
                  style={{ fontSize: 23, fontVariationSettings: active ? "'wght' 400, 'FILL' 1" : "'wght' 300" }}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
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

// ─── App Footer Item (menu-driven) ──────────────────────────

function AppFooterItem({
  item,
  pathname,
  base,
  count,
}: {
  item: MenuItemConfig;
  pathname: string;
  base: string;
  count: number;
}) {
  const href = resolveMenuItemHref(item.url, base);
  const active = isMenuItemActive(item.url, pathname, base);
  const iconName = resolveIcon(item.url);
  const isExternal = item.url.startsWith("http");
  const isSpecial = isSpecialLink(item.url);

  // 1–3 items: equal share. 4+: fixed ~29.4% width (3.4 per row)
  const widthStyle: React.CSSProperties = count <= 3
    ? { flex: 1 }
    : { flex: "0 0 calc(100% / 3.4)", minWidth: 0 };

  const cls = [
    "footer-link flex flex-col items-center justify-center gap-1 py-2",
    active ? "active" : "",
  ].filter(Boolean).join(" ");

  const icon = (
    <div className="footer-icon">
      <span
        className="material-symbols-rounded"
        style={{ fontSize: 23, fontVariationSettings: active ? "'wght' 400, 'FILL' 1" : "'wght' 300" }}
        aria-hidden="true"
      >
        {iconName}
      </span>
    </div>
  );

  const label = (
    <span className="text-[11px] font-semibold leading-none">{item.label}</span>
  );

  // Special links (#map:, #text:) and external — render as <a>
  if (isSpecial || isExternal || item.url.startsWith("mailto:") || item.url.startsWith("tel:")) {
    return (
      <a
        href={href}
        className={cls}
        style={{ ...widthStyle, color: "var(--footer-text, rgba(0,0,0,0.549))" }}
      >
        {icon}
        {label}
      </a>
    );
  }

  // Internal page links — Next.js Link
  return (
    <Link
      href={href}
      className={cls}
      style={{ ...widthStyle, color: active ? undefined : "var(--footer-text, rgba(0,0,0,0.549))" }}
      aria-current={active ? "page" : undefined}
    >
      {icon}
      {label}
    </Link>
  );
}

// ─── Classic Footer Element Renderer ─────────────────────────

function ClassicFooterElement({
  element,
  config,
}: {
  element: ElementInstance;
  config: TenantConfig;
}) {
  if (element.type === "menu") {
    const menuId = typeof element.settings.menu_id === "string" ? element.settings.menu_id : "";
    const menu = menuId ? config.menus?.find((m) => m.id === menuId) : undefined;
    if (!menu) return null;
    return <MenuAccordion menu={menu} />;
  }

  if (element.type === "divider") {
    return <hr className="classic-footer__divider" />;
  }

  if (element.type === "logo") {
    const logoUrl = config.theme?.header?.logoUrl;
    const width = (element.settings.width as number) ?? 120;
    const alignment = (element.settings.alignment as string) || "center";
    const alignMap: Record<string, string> = { left: "start", center: "center", right: "end" };
    if (!logoUrl) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt="Logo"
        style={{ width, height: "auto", display: "block", placeSelf: alignMap[alignment] ?? "center" }}
      />
    );
  }

  if (element.type === "button") {
    const label = (element.settings.content as string) || "";
    const url = (element.settings.url as string) || "#";
    return (
      <a href={url} className="classic-footer__button">
        {label}
      </a>
    );
  }

  return null;
}

// ─── Menu Accordion ──────────────────────────────────────────

function MenuAccordion({ menu }: { menu: MenuConfig }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="classic-footer__accordion">
      <button
        type="button"
        className="classic-footer__accordion-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="classic-footer__accordion-title">{menu.title}</span>
        <span
          className="material-symbols-rounded classic-footer__accordion-chevron"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>

      <div
        className={`classic-footer__accordion-body${open ? " classic-footer__accordion-body--open" : ""}`}
      >
        <ul className="classic-footer__link-list">
          {menu.items.map((item) => (
            <li key={item.id}>
              <a href={item.url} className="classic-footer__link">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
