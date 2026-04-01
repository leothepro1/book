"use server";

import { getInstalledApps, getAppDetail, getAppEvents } from "@/app/_lib/apps/actions";
import type { AppDetail, AppEvent } from "@/app/_lib/apps/actions";
import { getApp } from "@/app/_lib/apps/registry";
import type { AppDefinition } from "@/app/_lib/apps/types";
import "@/app/_lib/apps/definitions";

export type SettingsAppRow = {
  appId: string;
  name: string;
  icon: string;
  iconUrl?: string;
  status: string;
};

export type SettingsAppDetail = {
  app: AppDefinition;
  detail: AppDetail;
  events: AppEvent[];
};

export async function getInstalledAppsForSettings(): Promise<SettingsAppRow[]> {
  const installed = await getInstalledApps();

  const rows: SettingsAppRow[] = [];
  for (const app of installed) {
    const def = getApp(app.appId);
    if (!def) continue;
    rows.push({
      appId: def.id,
      name: def.name,
      icon: def.icon,
      iconUrl: def.iconUrl,
      status: app.status,
    });
  }

  return rows;
}

export async function getAppDetailForSettings(appId: string): Promise<SettingsAppDetail | null> {
  const def = getApp(appId);
  if (!def) return null;

  const [detail, events] = await Promise.all([
    getAppDetail(appId),
    getAppEvents(appId, 20),
  ]);

  if (!detail) return null;

  return { app: def, detail, events };
}
