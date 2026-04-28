import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getActiveAppsForSidebar } from '@/app/_lib/apps/actions';
import { APPS_MARKETPLACE_PATH } from '@/app/(admin)/_lib/apps/route-helpers';
import { InstalledAppsList } from './InstalledAppsList';
import '@/app/(admin)/_components/admin-page.css';
import './installed.css';

/**
 * Installed apps overview — the page the sidebar Appar item routes to
 * when the tenant has ≥1 active app.
 *
 * Defensive: if the user lands here with zero installed apps (URL bar,
 * stale link, just uninstalled the last one), bounce to the marketplace
 * so the empty page is never rendered.
 */
export default async function InstalledAppsPage() {
  const apps = await getActiveAppsForSidebar();

  if (apps.length === 0) {
    redirect(APPS_MARKETPLACE_PATH);
  }

  return (
    <div className="admin-page admin-page--no-preview">
      <div className="admin-editor">
        <div className="installed-apps__header">
          <div className="installed-apps__header-inner">
            <h1 className="admin-title">Appar</h1>
            <Link
              href={APPS_MARKETPLACE_PATH}
              className="settings-btn--connect"
              style={{ fontSize: 13, padding: '8px 15px' }}
            >
              Visa marknadsplats
            </Link>
          </div>
        </div>

        <div className="installed-apps__body">
          <InstalledAppsList apps={apps} />
        </div>
      </div>
    </div>
  );
}
