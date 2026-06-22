import { rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { stdout } from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");

const targets = [
  {
    label: ".next",
    path: resolve(appRoot, ".next"),
  },
  {
    label: "tsconfig.tsbuildinfo",
    path: resolve(appRoot, "tsconfig.tsbuildinfo"),
  },
];

function assertInsideAppRoot(targetPath) {
  const normalizedRelativePath = relative(appRoot, targetPath);

  if (
    normalizedRelativePath === "" ||
    normalizedRelativePath.startsWith("..") ||
    isAbsolute(normalizedRelativePath)
  ) {
    throw new Error(`Refusing to clean path outside apps/web: ${targetPath}`);
  }
}

for (const target of targets) {
  assertInsideAppRoot(target.path);
  await rm(target.path, { force: true, recursive: true });
  stdout.write(`removed ${target.label}\n`);
}
