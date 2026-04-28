'use client';

import { SectionShell } from './SectionShell';
import { useSettings } from './SettingsContext';
import { useNavigationGuard } from './NavigationGuard';
import { useRole } from './RoleContext';
import { useSidebar } from './SidebarContext';
import { visibleSettingsNavItems } from './settings-nav-items';

/**
 * Settings drill-in nav body.
 *
 * Slots into the main sidebar below `SidebarOrgRow` while the user is in
 * the settings section. Items use the shared `.sb__*` classes — visually
 * identical to main-nav rows.
 */
export function SettingsSidebar() {
  const { isCollapsed } = useSidebar();
  const { activeTab, setActiveTab, close } = useSettings();
  const { guardAction, isGuarded } = useNavigationGuard();
  const { isAdmin } = useRole();

  const handleBack = () => {
    if (isGuarded) guardAction(close);
    else close();
  };

  const items = visibleSettingsNavItems(isAdmin);

  return (
    <SectionShell title="Inställningar" onBack={handleBack}>
      {items.map((item) => {
        const active = activeTab === item.id;
        const handleClick = () => {
          const switchTab = () => setActiveTab(item.id);
          if (isGuarded && item.id !== activeTab) {
            guardAction(switchTab);
          } else {
            switchTab();
          }
        };
        const className = [
          'sb__item',
          active && 'sb__item--active',
          isCollapsed && 'sb__item--collapsed',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <button key={item.id} type="button" onClick={handleClick} className={className}>
            <span className="material-symbols-rounded sb__icon">{item.icon}</span>
            <span className="sb__label">{item.label}</span>
          </button>
        );
      })}
    </SectionShell>
  );
}
