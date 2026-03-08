/**
 * Apple Wallet renderer — STUB.
 *
 * This adapter will eventually:
 *  - Generate .pkpass files signed with Apple certificates
 *  - Serve them via an API endpoint
 *  - Handle push notifications for pass updates
 *
 * For now: logs the render request as an audit event and returns a
 * placeholder link. Core functionality (issue/revoke/validate) works
 * independently of this adapter.
 */

import { logPassEvent } from "../events";
import type { WalletRenderer, PlatformRef } from "../types";

export const appleRenderer: WalletRenderer = {
  platform: "APPLE",

  async ensure(passId: string, tenantId: string): Promise<PlatformRef> {
    await logPassEvent({
      tenantId,
      passId,
      type: "RENDERED_APPLE",
      metadata: { stub: true, message: "Apple Wallet rendering not yet implemented" },
    });

    return {
      platform: "APPLE",
      externalId: `apple-stub-${passId}`,
      addLink: `#apple-wallet-not-implemented`,
    };
  },

  async getAddLink(passId: string, _tenantId: string): Promise<string | null> {
    return `#apple-wallet-not-implemented-${passId}`;
  },

  async refresh(passId: string, tenantId: string): Promise<void> {
    await logPassEvent({
      tenantId,
      passId,
      type: "RENDERED_APPLE",
      metadata: { stub: true, action: "refresh" },
    });
  },
};
