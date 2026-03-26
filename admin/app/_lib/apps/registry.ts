/**
 * App Registry — Static, code-defined app manifest system.
 *
 * Apps are defined in code, not in the database.
 * The DB stores installations (TenantApp), not app definitions.
 *
 * registerApp() is called at the end of each definition file.
 * getApp() and getAllApps() are the ONLY entry points — never access
 * the registry Map directly.
 */

import { AppDefinitionSchema } from "./types";
import type { AppDefinition } from "./types";

const registry = new Map<string, AppDefinition>();

/**
 * Register an app definition. Called once per app at module load time.
 * Validates the definition with Zod and throws on duplicate IDs.
 */
export function registerApp(definition: AppDefinition): void {
  // Runtime validation — catches schema violations at startup
  const parsed = AppDefinitionSchema.parse(definition);

  if (registry.has(parsed.id)) {
    throw new Error(`Duplicate app ID: "${parsed.id}" — app IDs must be unique and permanent`);
  }

  // Validate dependency references exist (deferred check at first access)
  // Dependencies are validated lazily because registration order is not guaranteed.
  registry.set(parsed.id, parsed);
}

/**
 * Get a single app definition by ID. Returns undefined if not found.
 */
export function getApp(id: string): AppDefinition | undefined {
  return registry.get(id);
}

/**
 * Get all registered app definitions.
 */
export function getAllApps(): AppDefinition[] {
  return Array.from(registry.values());
}

/**
 * Validate that all dependency references are resolvable.
 * Called lazily — safe to call after all definitions are loaded.
 */
export function validateDependencies(): void {
  for (const app of registry.values()) {
    for (const depId of app.dependencies) {
      if (!registry.has(depId)) {
        throw new Error(
          `App "${app.id}" depends on "${depId}" which is not registered`
        );
      }
    }
  }
}
