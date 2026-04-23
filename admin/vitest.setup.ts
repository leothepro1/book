/**
 * Vitest shared setup — runs before every test file.
 *
 * Wires @testing-library/react's automatic cleanup. We do this manually
 * because `test.globals` is off in vitest.config.ts, which prevents
 * @testing-library/react from registering its own afterEach hook.
 * Without cleanup, DOM and portal roots leak between tests in the same
 * file and React Testing Library's queries start matching stale nodes.
 */

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
