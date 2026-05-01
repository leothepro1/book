#!/usr/bin/env node
/**
 * Phase 3 PR-B — Build the analytics web-pixel runtime.
 *
 * Bundles `app/_lib/analytics/pipeline/runtime/worker.ts` (and the
 * loader source added in Commit F) into hashed assets under
 * `public/analytics/`. Writes/updates `runtime-manifest.json` so the
 * server-rendered loader script knows which hashed file to spawn.
 *
 * Hard gates (exit 1 with a clear stderr message):
 *
 *   RUNTIME_GZ_MAX = 30 * 1024  — locked target. If the worker bundle
 *     exceeds this, STOP. Do not advance to Commit F. Report the
 *     measured size and discuss fallback (B = hand-rolled validators).
 *
 *   LOADER_GZ_MAX = 12 * 1024   — placeholder for Commit F. Soft warn
 *     at LOADER_GZ_WARN = 8 * 1024.
 *
 *   COMBINED_GZ_WARN = 40 * 1024 — warn-only. Future-proof against
 *     budget creep when worker is in critical render path.
 *
 * Hash strategy: SHA-256 of the bundled source bytes, truncated to 16
 * hex characters. Same source → same hash → same filename → cache
 * stays valid across rebuilds. Time-of-day input (timestamps, git
 * SHA) is intentionally avoided.
 *
 * Esbuild config is locked per the PR-B plan:
 *   format='esm', treeShaking=true, minify=true, target='es2020',
 *   sourcemap='external', external=[].
 *
 * external=[] is explicit (not the default — esbuild's default is to
 * leave node-builtin specifiers alone, which doesn't matter here but
 * the explicit empty list documents intent: every import is bundled,
 * nothing is left as a remote reference).
 */

import { createHash } from "node:crypto";
import {
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import * as esbuild from "esbuild";

// ── Paths ─────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const RUNTIME_ENTRY = join(
  REPO_ROOT,
  "app/_lib/analytics/pipeline/runtime/worker.ts",
);
const LOADER_ENTRY = join(
  REPO_ROOT,
  "app/_lib/analytics/pipeline/runtime/loader.ts",
);
const OUT_DIR = join(REPO_ROOT, "public/analytics");
const MANIFEST_PATH = join(OUT_DIR, "runtime-manifest.json");

// ── Size budgets (bytes, gzipped) ─────────────────────────────────────────

const RUNTIME_GZ_MAX = 30 * 1024; // 30 KB hard
const LOADER_GZ_MAX = 12 * 1024; // 12 KB hard
const LOADER_GZ_WARN = 8 * 1024; // 8 KB soft warn
const COMBINED_GZ_WARN = 40 * 1024; // 40 KB combined warn-only

// ── Esbuild config (locked) ───────────────────────────────────────────────

/** @type {import('esbuild').BuildOptions} */
const COMMON_BUILD_OPTIONS = {
  bundle: true,
  format: "esm",
  treeShaking: true,
  minify: true,
  target: "es2020",
  sourcemap: "external",
  external: [], // explicit: bundle everything, leave nothing remote
  legalComments: "none",
  logLevel: "warning",
  // Leaf imports of schema files transitively pull in Zod + base.ts;
  // tree-shaking + minify must drop unused exports. The verifier in
  // Commit I greps the bundle for sentinel server-only event names
  // (e.g. `payment_succeeded`, `booking_completed`) — any presence
  // indicates tree-shake leak and fails the verify step.
};

// ── Helpers ───────────────────────────────────────────────────────────────

function hashSource(bytes) {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(2)} KB`;
}

function ensureOutDir() {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }
}

/**
 * Remove previous hashed bundles so old artifacts don't accumulate
 * across rebuilds. Preserves the manifest itself (we rewrite it).
 */
function cleanPreviousArtifacts(prefix) {
  ensureOutDir();
  for (const name of readdirSync(OUT_DIR)) {
    if (name.startsWith(`${prefix}.`) && (name.endsWith(".js") || name.endsWith(".js.map"))) {
      try {
        unlinkSync(join(OUT_DIR, name));
      } catch {
        /* ignore */
      }
    }
  }
}

async function buildBundle({ entry, prefix }) {
  if (!existsSync(entry)) {
    return null; // source not present yet (loader arrives in Commit F)
  }
  cleanPreviousArtifacts(prefix);

  const tmpOut = join(OUT_DIR, `${prefix}.tmp.js`);
  await esbuild.build({
    ...COMMON_BUILD_OPTIONS,
    entryPoints: [entry],
    outfile: tmpOut,
  });

  const code = readFileSync(tmpOut);
  const map = readFileSync(`${tmpOut}.map`);
  const hash = hashSource(code);
  const finalName = `${prefix}.${hash}.js`;
  const finalPath = join(OUT_DIR, finalName);
  const finalMap = `${finalPath}.map`;

  writeFileSync(finalPath, code);
  writeFileSync(finalMap, map);
  unlinkSync(tmpOut);
  unlinkSync(`${tmpOut}.map`);

  const gz = gzipSync(code).length;
  return { entry, prefix, fileName: finalName, hash, rawBytes: code.length, gzBytes: gz };
}

function checkBudget({ prefix, gzBytes, rawBytes }) {
  if (prefix === "runtime") {
    if (gzBytes > RUNTIME_GZ_MAX) {
      console.error(
        `\n[build-analytics-runtime] STOP: runtime.js gzipped ${fmtBytes(
          gzBytes,
        )} exceeds the locked 30 KB cap.\n` +
          "Per PR-B plan: do NOT advance to Commit F. Report the measured\n" +
          "size to Leo and discuss fallback B (hand-rolled validators).\n" +
          `  raw: ${fmtBytes(rawBytes)}\n` +
          `  gzipped: ${fmtBytes(gzBytes)}\n` +
          `  budget: ${fmtBytes(RUNTIME_GZ_MAX)}\n`,
      );
      process.exit(1);
    }
    console.log(
      `[build-analytics-runtime] runtime.js   ${fmtBytes(rawBytes)} raw / ${fmtBytes(
        gzBytes,
      )} gz  (budget ${fmtBytes(RUNTIME_GZ_MAX)})`,
    );
  } else if (prefix === "loader") {
    if (gzBytes > LOADER_GZ_MAX) {
      console.error(
        `\n[build-analytics-runtime] STOP: loader.js gzipped ${fmtBytes(
          gzBytes,
        )} exceeds the 12 KB cap.\n`,
      );
      process.exit(1);
    }
    if (gzBytes > LOADER_GZ_WARN) {
      console.warn(
        `[build-analytics-runtime] loader.js gzipped ${fmtBytes(
          gzBytes,
        )} > ${fmtBytes(LOADER_GZ_WARN)} soft warn`,
      );
    }
    console.log(
      `[build-analytics-runtime] loader.js    ${fmtBytes(rawBytes)} raw / ${fmtBytes(
        gzBytes,
      )} gz  (budget ${fmtBytes(LOADER_GZ_MAX)})`,
    );
  }
}

function writeManifest(bundles) {
  const manifest = {
    builtAt: new Date().toISOString(),
    runtime: bundles.runtime?.fileName ?? null,
    runtimeHash: bundles.runtime?.hash ?? null,
    loader: bundles.loader?.fileName ?? null,
    loaderHash: bundles.loader?.hash ?? null,
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  ensureOutDir();
  console.log(`[build-analytics-runtime] writing to ${OUT_DIR}`);

  const runtime = await buildBundle({ entry: RUNTIME_ENTRY, prefix: "runtime" });
  if (!runtime) {
    console.error(
      `[build-analytics-runtime] missing runtime entry ${RUNTIME_ENTRY}`,
    );
    process.exit(1);
  }
  checkBudget(runtime);

  const loader = await buildBundle({ entry: LOADER_ENTRY, prefix: "loader" });
  if (loader) {
    checkBudget(loader);
  } else {
    console.log(
      `[build-analytics-runtime] loader.ts not present yet (added in Commit F)`,
    );
  }

  if (loader && runtime.gzBytes + loader.gzBytes > COMBINED_GZ_WARN) {
    console.warn(
      `[build-analytics-runtime] combined ${fmtBytes(
        runtime.gzBytes + loader.gzBytes,
      )} > ${fmtBytes(COMBINED_GZ_WARN)} soft warn — review for budget creep`,
    );
  }

  writeManifest({ runtime, loader });
  console.log(
    `[build-analytics-runtime] manifest written: ${MANIFEST_PATH.replace(REPO_ROOT + "/", "")}`,
  );
}

main().catch((err) => {
  console.error("[build-analytics-runtime] unhandled error:", err);
  process.exit(1);
});
