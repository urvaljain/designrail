// Removes build output directories passed as arguments (relative to the repo root).
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
for (const target of process.argv.slice(2)) {
  const full = resolve(root, target);
  if (!full.startsWith(root + "/") && full !== root)
    throw new Error(`Refusing to clean outside repo: ${target}`);
  rmSync(full, { recursive: true, force: true });
}
