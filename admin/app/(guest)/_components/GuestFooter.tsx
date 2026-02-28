"use client";

import type { TenantConfig } from "../_lib/tenant/types";

function featureAllowed(
  required: "none" | "commerce" | "account",
  config: TenantConfig
) {
  if (required === "none") return true;
  if (required === "commerce") return config.features.commerceEnabled;
  if (required === "account") return config.features.accountEnabled;
  return false;
}

export default function GuestFooter({
  config,
}: {
  config: TenantConfig;
}) {
  const items = [...config.footer.items]
    .filter((i) => i.isEnabled)
    .filter((i) => featureAllowed(i.requiredFeature, config))
    .sort((a, b) => a.order - b.order);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border)] bg-[var(--background)]/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-around px-4 py-3">
        {items.map((item) => (
          <button
            key={item.key}
            className="text-xs font-medium text-[var(--text)]"
          >
            {item.label_sv}
          </button>
        ))}
      </div>
    </nav>
  );
}