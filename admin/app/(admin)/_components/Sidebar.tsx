'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { t, type AdminLocale } from '../_lib/i18n';
import { useSidebar } from './SidebarContext';

export function Sidebar() {
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const [isPortalOpen, setIsPortalOpen] = useState(true);
  const pathname = usePathname();
  const locale: AdminLocale = 'sv';

  const isActive = (path: string) => pathname === path;

  return (
    <aside
      className={`fixed left-0 top-[calc(3.5rem+1px)] h-[calc(100vh-3.5rem-1px)] bg-[#F1F0EE] rounded-tl-[20px] transition-all duration-300 ease-in-out z-30 flex flex-col ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Navigation - flex-1 för att ta upp allt utrymme */}
      <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
        {/* Min portal - Accordion (aldrig active själv) */}
        <div>
          <button
            onClick={() => setIsPortalOpen(!isPortalOpen)}
            className="w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-[#6D6C6B] hover:bg-[#E6E5E3]"
          >
            {/* Icon - fixed position */}
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256" className="flex-shrink-0">
              <path d="M80,40a40,40,0,1,0,40,40A40,40,0,0,0,80,40Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,80,104Zm96,16a40,40,0,1,0-40-40A40,40,0,0,0,176,120Zm0-64a24,24,0,1,1-24,24A24,24,0,0,1,176,56ZM80,136a40,40,0,1,0,40,40A40,40,0,0,0,80,136Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,80,200Zm136-24a8,8,0,0,1-8,8H184v24a8,8,0,0,1-16,0V184H144a8,8,0,0,1,0-16h24V144a8,8,0,0,1,16,0v24h24A8,8,0,0,1,216,176Z"></path>
            </svg>
            
            {/* Text - fades out */}
            <span className={`font-medium text-sm whitespace-nowrap overflow-hidden transition-all duration-200 ${
              isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
            }`}>
              {t(locale, 'myPortal')}
            </span>
            
            {/* Chevron - fades out, takes no space when hidden */}
            <svg
              className={`w-4 h-4 flex-shrink-0 ml-auto transition-all duration-200 ${
                isPortalOpen ? 'rotate-180' : ''
              } ${isCollapsed ? 'w-0 opacity-0' : 'opacity-100'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Accordion innehåll */}
          <div
            className={`overflow-hidden transition-all duration-300 ${
              isPortalOpen && !isCollapsed ? 'max-h-40 opacity-100 mt-1' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="mx-4 border-l border-[#E6E5E3] pl-4 space-y-1">
              <Link
                href="/dashboard"
                className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive('/dashboard')
                    ? 'bg-[#E6E5E3] text-[#7F22FE] font-medium'
                    : 'text-[#6D6C6B] hover:bg-[#E6E5E3]'
                }`}
              >
                {t(locale, 'home')}
              </Link>
              <Link
                href="/dashboard/account"
                className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive('/dashboard/account')
                    ? 'bg-[#E6E5E3] text-[#7F22FE] font-medium'
                    : 'text-[#6D6C6B] hover:bg-[#E6E5E3]'
                }`}
              >
                {t(locale, 'account')}
              </Link>
              <Link
                href="/design"
                className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive('/design')
                    ? 'bg-[#E6E5E3] text-[#7F22FE] font-medium'
                    : 'text-[#6D6C6B] hover:bg-[#E6E5E3]'
                }`}
              >
                Design
              </Link>
            </div>
          </div>
        </div>

        {/* Gäster */}
        <Link
          href="/dashboard/guests"
          className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
            isActive('/dashboard/guests')
              ? 'bg-[#E6E5E3] text-[#7F22FE]'
              : 'text-[#6D6C6B] hover:bg-[#E6E5E3]'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256" className="flex-shrink-0">
            <path d="M117.25,157.92a60,60,0,1,0-66.5,0A95.83,95.83,0,0,0,3.53,195.63a8,8,0,1,0,13.4,8.74,80,80,0,0,1,134.14,0,8,8,0,0,0,13.4-8.74A95.83,95.83,0,0,0,117.25,157.92ZM40,108a44,44,0,1,1,44,44A44.05,44.05,0,0,1,40,108Zm210.14,98.7a8,8,0,0,1-11.07-2.33A79.83,79.83,0,0,0,172,168a8,8,0,0,1,0-16,44,44,0,1,0-16.34-84.87,8,8,0,1,1-5.94-14.85,60,60,0,0,1,55.53,105.64,95.83,95.83,0,0,1,47.22,37.71A8,8,0,0,1,250.14,206.7Z"></path>
          </svg>
          <span className={`text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-200 ${
            isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
          }`}>
            {t(locale, 'bookings')}
          </span>
        </Link>

        {/* Organisation */}
        <Link
          href="/dashboard/organization"
          className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
            isActive('/dashboard/organization')
              ? 'bg-[#E6E5E3] text-[#7F22FE]'
              : 'text-[#6D6C6B] hover:bg-[#E6E5E3]'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256" className="flex-shrink-0">
            <path d="M232,96a7.89,7.89,0,0,0-.3-2.2L217.35,43.6A16.07,16.07,0,0,0,202,32H54A16.07,16.07,0,0,0,38.65,43.6L24.31,93.8A7.89,7.89,0,0,0,24,96h0v16a40,40,0,0,0,16,32v72a8,8,0,0,0,8,8H208a8,8,0,0,0,8-8V144a40,40,0,0,0,16-32V96ZM54,48H202l11.42,40H42.61Zm50,56h48v8a24,24,0,0,1-48,0Zm-16,0v8a24,24,0,0,1-35.12,21.26,7.88,7.88,0,0,0-1.82-1.06A24,24,0,0,1,40,112v-8ZM200,208H56V151.2a40.57,40.57,0,0,0,8,.8,40,40,0,0,0,32-16,40,40,0,0,0,64,0,40,40,0,0,0,32,16,40.57,40.57,0,0,0,8-.8Zm4.93-75.8a8.08,8.08,0,0,0-1.8,1.05A24,24,0,0,1,168,112v-8h48v8A24,24,0,0,1,204.93,132.2Z"></path>
          </svg>
          <span className={`text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-200 ${
            isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
          }`}>
            {t(locale, 'organization')}
          </span>
        </Link>

        {/* Tools section */}
        <div className="pt-4">
          <div className={`px-2 mb-2 overflow-hidden transition-all duration-200 ${
            isCollapsed ? 'h-0 opacity-0' : 'h-auto opacity-100'
          }`}>
            <span className="text-xs font-semibold text-[#6D6C6B] uppercase tracking-wider whitespace-nowrap">
              {t(locale, 'tools')}
            </span>
          </div>

          {/* Analyser */}
          <Link
            href="/dashboard/analytics"
            className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
              isActive('/dashboard/analytics')
                ? 'bg-[#E6E5E3] text-[#7F22FE]'
                : 'text-[#6D6C6B] hover:bg-[#E6E5E3]'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256" className="flex-shrink-0">
              <path d="M224,200h-8V40a8,8,0,0,0-8-8H152a8,8,0,0,0-8,8V80H96a8,8,0,0,0-8,8v40H48a8,8,0,0,0-8,8v64H32a8,8,0,0,0,0,16H224a8,8,0,0,0,0-16ZM160,48h40V200H160ZM104,96h40V200H104ZM56,144H88v56H56Z"></path>
            </svg>
            <span className={`text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-200 ${
              isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
            }`}>
              {t(locale, 'analytics')}
            </span>
          </Link>

          {/* Integrationer */}
          <Link
            href="/dashboard/integrations"
            className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
              isActive('/dashboard/integrations')
                ? 'bg-[#E6E5E3] text-[#7F22FE]'
                : 'text-[#6D6C6B] hover:bg-[#E6E5E3]'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256" className="flex-shrink-0">
              <path d="M80,120h96a8,8,0,0,1,0,16H80a8,8,0,0,1,0-16Zm24,48H64a40,40,0,0,1,0-80h40a8,8,0,0,0,0-16H64a56,56,0,0,0,0,112h40a8,8,0,0,0,0-16Zm88-96H152a8,8,0,0,0,0,16h40a40,40,0,0,1,0,80H152a8,8,0,0,0,0,16h40a56,56,0,0,0,0-112Z"></path>
            </svg>
            <span className={`text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-200 ${
              isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
            }`}>
              {t(locale, 'integrations')}
            </span>
          </Link>
        </div>
      </nav>

      {/* Footer med ikoner - längst ner */}
      <div className="p-3 flex-shrink-0 border-t border-[#E6E5E3]">
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          {/* Hjälp-ikon - döljs när collapsed */}
          {!isCollapsed && (
            <button className="p-2 text-[#6D6C6B] hover:bg-[#E6E5E3] rounded-lg transition-colors">
              <svg width="21" height="21" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10.2 15.5796C10.7178 15.5796 11.1375 15.1599 11.1375 14.6421C11.1375 14.1243 10.7178 13.7046 10.2 13.7046C9.68225 13.7046 9.26251 14.1243 9.26251 14.6421C9.26251 15.1599 9.68225 15.5796 10.2 15.5796Z" fill="currentColor" fillOpacity="0.9"></path>
                <path d="M10.2 11.8296V11.2046C11.5805 11.2046 12.7 10.2249 12.7 9.01709C12.7 7.80928 11.5805 6.82959 10.2 6.82959C8.81954 6.82959 7.70001 7.80928 7.70001 9.01709V9.32959M17.7 10.5796C17.7 14.7217 14.3421 18.0796 10.2 18.0796C6.05788 18.0796 2.70001 14.7217 2.70001 10.5796C2.70001 6.43745 6.05788 3.07959 10.2 3.07959C14.3421 3.07959 17.7 6.43745 17.7 10.5796Z" stroke="currentColor" strokeOpacity="0.9" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"></path>
              </svg>
            </button>
          )}

          {/* Collapse/Expand-knapp */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 text-[#6D6C6B] hover:bg-[#E6E5E3] rounded-lg transition-colors"
            aria-label={isCollapsed ? 'Expandera sidebar' : 'Kollapsa sidebar'}
          >
            {isCollapsed ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M7 3a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4V7a4 4 0 0 0-4-4zm1.5 16.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5h1.5zm1.5 0v-15h7A2.5 2.5 0 0 1 19.5 7v10a2.5 2.5 0 0 1-2.5 2.5z" fill="currentColor"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M7 21a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7Zm3-16.5v15h7a2.5 2.5 0 0 0 2.5-2.5V7A2.5 2.5 0 0 0 17 4.5h-7Z" fill="currentColor"></path>
              </svg>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
