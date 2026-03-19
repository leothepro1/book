'use client';

import { type MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from './SidebarContext';
import { useNavigationGuard } from './NavigationGuard';
import { SidebarUserRow } from './SidebarUserRow';
import { useSettings } from './SettingsContext';
import { useRole } from './RoleContext';

const NAV_ITEMS = [
  { href: '/home', label: 'Startsida', icon: 'storefront' },
  { href: '/dashboard/guests', label: 'Gäster', icon: 'group' },
  { href: '/dashboard/analytics', label: 'Analys', icon: 'leaderboard' },
];

const CONTENT_ITEMS = [
  { href: '/files', label: 'Filer' },
  { href: '/maps', label: 'Kartor' },
  { href: '/menus', label: 'Menyer' },
];

// Curved connector SVG for active sub-item
const CONNECTOR_SVG = `data:image/svg+xml,%3Csvg%20width%3D'21'%20height%3D'28'%20viewBox%3D'0%200%2021%2028'%20fill%3D'none'%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%3E%3Cpath%20d%3D'M19%2014.25H19.75V15.75H19V14.25ZM10.077%2013.362L10.7452%2013.0215V13.0215L10.077%2013.362ZM11.388%2014.673L11.7285%2014.0048H11.7285L11.388%2014.673ZM10.5%200V10.2H9V0H10.5ZM14.55%2014.25H19V15.75H14.55V14.25ZM10.5%2010.2C10.5%2011.0525%2010.5006%2011.6467%2010.5384%2012.1093C10.5755%2012.5632%2010.6446%2012.824%2010.7452%2013.0215L9.40873%2013.7025C9.18239%2013.2582%209.08803%2012.7781%209.04336%2012.2315C8.99942%2011.6936%209%2011.0277%209%2010.2H10.5ZM14.55%2015.75C13.7223%2015.75%2013.0564%2015.7506%2012.5185%2015.7066C11.9719%2015.662%2011.4918%2015.5676%2011.0475%2015.3413L11.7285%2014.0048C11.926%2014.1054%2012.1868%2014.1745%2012.6407%2014.2116C13.1033%2014.2494%2013.6975%2014.25%2014.55%2014.25V15.75ZM10.7452%2013.0215C10.9609%2013.4448%2011.3052%2013.7891%2011.7285%2014.0048L11.0475%2015.3413C10.3419%2014.9817%209.76825%2014.4081%209.40873%2013.7025L10.7452%2013.0215Z'%20fill%3D'%23B5B5B5'/%3E%3Cpath%20d%3D'M17%2012L20%2015L17%2018'%20stroke%3D'%23B5B5B5'%20stroke-width%3D'1.5'%20stroke-linecap%3D'round'%20stroke-linejoin%3D'round'/%3E%3C/svg%3E`;

// Straight vertical line SVG for non-active sub-items
// preserveAspectRatio="none" ensures the rect stretches to fill any height
const LINE_SVG = `data:image/svg+xml,%3Csvg%20width%3D'21'%20height%3D'28'%20viewBox%3D'0%200%2021%2028'%20preserveAspectRatio%3D'none'%20fill%3D'none'%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%3E%3Crect%20x%3D'9'%20width%3D'1.5'%20height%3D'28'%20fill%3D'%23B5B5B5'%2F%3E%3C%2Fsvg%3E`;

export function Sidebar() {
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const pathname = usePathname();
  const { navigate, isGuarded } = useNavigationGuard();
  const { open: openSettings } = useSettings();
  const { isAdmin } = useRole();

  const isActive = (path: string) => pathname === path;
  const isContentActive = CONTENT_ITEMS.some((item) => isActive(item.href));

  const guardedClick = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (isGuarded) {
      e.preventDefault();
      navigate(href);
    }
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-screen transition-all duration-300 ease-in-out z-30 flex flex-col ${
        isCollapsed ? 'w-16' : 'w-[270px]'
      }`}
      style={{ background: '#f7f7f7', borderRight: '1px solid var(--admin-border)' }}
    >
      {/* Profile row */}
      <SidebarUserRow isCollapsed={isCollapsed} />

      {/* Navigation */}
      <nav className="p-3 flex-1 overflow-y-auto flex flex-col gap-[2px]">
        {/* Top nav items (Startsida, Gäster) */}
        {NAV_ITEMS.filter((_, i) => i < 2).map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => guardedClick(e, item.href)}
              className={`flex items-center gap-3 p-[10px] rounded-lg ${
                active
                  ? 'bg-[#ebebeb] text-[#171717]'
                  : 'text-[#404040] hover:bg-[#f3f3f3] hover:text-[#404040]'
              }`}
            >
              <span
                className="material-symbols-rounded flex-shrink-0"
                style={{
                  fontSize: 20,
                  fontVariationSettings: active
                    ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                    : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                }}
              >
                {item.icon}
              </span>
              <span className={`text-[14px] tracking-[-0.15px] font-[500] whitespace-nowrap overflow-hidden transition-all duration-200 ${
                isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
              }`}>
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Innehåll — accordion with sub-items */}
        <div>
          <Link
            href={CONTENT_ITEMS[0].href}
            onClick={(e) => guardedClick(e, CONTENT_ITEMS[0].href)}
            className="flex items-center gap-3 p-[10px] rounded-lg text-[#404040] hover:bg-[#f3f3f3] hover:text-[#404040]"
          >
            <span
              className="material-symbols-rounded flex-shrink-0"
              style={{
                fontSize: 20,
                fontVariationSettings: isContentActive
                  ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                  : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
              }}
            >
              wall_art
            </span>
            <span className={`text-[14px] tracking-[-0.15px] font-[500] whitespace-nowrap overflow-hidden transition-all duration-200 ${
              isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
            }`}>
              Innehåll
            </span>
          </Link>

          {/* Sub-items — visible when content is active */}
          <div className={`overflow-hidden transition-all duration-300 ${
            isContentActive && !isCollapsed ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
          }`}>
            <div className="flex flex-col">
              {CONTENT_ITEMS.map((sub, idx) => {
                const subActive = isActive(sub.href);
                const activeIdx = CONTENT_ITEMS.findIndex((s) => isActive(s.href));
                const showLine = !subActive && (activeIdx === -1 || idx < activeIdx);

                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    onClick={(e) => guardedClick(e, sub.href)}
                    className={`relative block py-[6px] rounded-lg text-[14px] font-[500] ${
                      subActive
                        ? 'bg-[#ebebeb] text-[#171717]'
                        : 'text-[#404040] hover:bg-[#f3f3f3] hover:text-[#404040]'
                    }`}
                    style={{ paddingLeft: 36 }}
                  >
                    {subActive ? (
                      <img
                        src={CONNECTOR_SVG}
                        alt=""
                        className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ width: 21, height: 28, left: 7.5, marginTop: -1.5 }}
                      />
                    ) : showLine ? (
                      <img
                        src={LINE_SVG}
                        alt=""
                        className="absolute pointer-events-none"
                        style={{ width: 21, left: 7.5, top: -6, bottom: -6, height: 'calc(100% + 12px)' }}
                      />
                    ) : null}
                    {sub.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom nav items (Analys) */}
        {NAV_ITEMS.filter((_, i) => i >= 2).map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => guardedClick(e, item.href)}
              className={`flex items-center gap-3 p-[10px] rounded-lg ${
                active
                  ? 'bg-[#ebebeb] text-[#171717]'
                  : 'text-[#404040] hover:bg-[#f3f3f3] hover:text-[#404040]'
              }`}
            >
              <span
                className="material-symbols-rounded flex-shrink-0"
                style={{
                  fontSize: 20,
                  fontVariationSettings: active
                    ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                    : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                }}
              >
                {item.icon}
              </span>
              <span className={`text-[14px] tracking-[-0.15px] font-[500] whitespace-nowrap overflow-hidden transition-all duration-200 ${
                isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
              }`}>
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Inställningar — only visible to org:admin */}
        {isAdmin && (
          <button
            onClick={() => openSettings()}
            className="w-full flex items-center gap-3 p-[10px] rounded-lg text-[#404040] hover:bg-[#f3f3f3] hover:text-[#404040] cursor-pointer"
          >
            <span
              className="material-symbols-rounded flex-shrink-0"
              style={{
                fontSize: 20,
                fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
              }}
            >
              settings
            </span>
            <span className={`text-[14px] tracking-[-0.15px] font-[500] whitespace-nowrap overflow-hidden transition-all duration-200 ${
              isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
            }`}>
              Inställningar
            </span>
          </button>
        )}
      </nav>

      {/* Footer */}
      <div className="p-3 flex-shrink-0 border-t border-[#E6E5E3]">
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isCollapsed && (
            <button className="p-2 text-[#404040] hover:bg-[#f3f3f3] hover:text-[#404040] rounded-lg">
              <span className="material-symbols-rounded" style={{ fontSize: 20 }}>help</span>
            </button>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 text-[#404040] hover:bg-[#f3f3f3] hover:text-[#404040] rounded-lg"
            aria-label={isCollapsed ? 'Expandera sidebar' : 'Kollapsa sidebar'}
          >
            {isCollapsed ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M7 3a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4V7a4 4 0 0 0-4-4zm1.5 16.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5h1.5zm1.5 0v-15h7A2.5 2.5 0 0 1 19.5 7v10a2.5 2.5 0 0 1-2.5 2.5z" fill="currentColor" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M7 21a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7Zm3-16.5v15h7a2.5 2.5 0 0 0 2.5-2.5V7A2.5 2.5 0 0 0 17 4.5h-7Z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
