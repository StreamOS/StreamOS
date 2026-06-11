import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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

for (const target of targets) {
  await rm(target.path, { force: true, recursive: true });
  stdout.write(`removed ${target.label}\n`);
}
