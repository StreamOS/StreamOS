"use strict";

function isCiEnvironment() {
  if (process.env.CI === "true" || process.env.CI === "1") {
    return true;
  }

  if (process.env.VERCEL === "1" || process.env.GITHUB_ACTIONS === "true") {
    return true;
  }

  try {
    return require("is-ci");
  } catch {
    return false;
  }
}

async function run() {
  if (isCiEnvironment()) {
    return;
  }

  let installHusky;

  try {
    ({ default: installHusky } = await import("husky"));
  } catch {
    return;
  }

  const result = installHusky();

  if (typeof result === "string" && result.length > 0) {
    console.log(result);
  }
}

run().catch((error) => {
  console.error("prepare failed:", error);
  process.exitCode = 1;
});
