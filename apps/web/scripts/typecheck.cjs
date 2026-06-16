/* global __dirname, process */
const { mkdirSync, rmSync } = require("node:fs");
const path = require("node:path");
const { Atomics } = globalThis;
const { spawnSync } = require("node:child_process");

const appDir = path.resolve(__dirname, "..");
const nextTypesDir = path.join(appDir, ".next", "types");
const typecheckLockDir = path.join(appDir, ".next", "typecheck.lock");
const tsBuildInfoPath = path.join(appDir, "tsconfig.tsbuildinfo");

const isLockOwner = acquireLock();

try {
  if (isLockOwner) {
    removePath(nextTypesDir);
    removePath(tsBuildInfoPath);
    run(process.execPath, [require.resolve("next/dist/bin/next"), "typegen"]);
  } else {
    waitForUnlock();
  }

  run(process.execPath, [require.resolve("typescript/lib/tsc"), "--noEmit"]);
} finally {
  if (isLockOwner) {
    removePath(typecheckLockDir);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: appDir,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function acquireLock() {
  try {
    mkdirSync(path.dirname(typecheckLockDir), { recursive: true });
    mkdirSync(typecheckLockDir, { recursive: false });
    return true;
  } catch (error) {
    if (error && error.code === "EEXIST") {
      return false;
    }

    throw error;
  }
}

function waitForUnlock() {
  const waitUntil = Date.now() + 120000;

  while (Date.now() < waitUntil) {
    try {
      mkdirSync(path.dirname(typecheckLockDir), { recursive: true });
      mkdirSync(typecheckLockDir, { recursive: false });
      removePath(typecheckLockDir);
      return;
    } catch (error) {
      if (error && error.code === "EEXIST") {
        sleep(100);
        continue;
      }

      throw error;
    }
  }

  throw new Error("Timed out waiting for Next.js type generation lock.");
}

function removePath(targetPath) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(targetPath, { force: true, recursive: true });
      return;
    } catch (error) {
      if (
        error &&
        (error.code === "EPERM" || error.code === "EBUSY") &&
        attempt < 4
      ) {
        sleep(100 * (attempt + 1));
        continue;
      }

      throw error;
    }
  }
}

function sleep(durationMs) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, durationMs);
}
