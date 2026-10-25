import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | undefined;

/** Reads the version from this package's package.json (works from src/ and dist/). */
export function toolVersion(): string {
  if (cached) return cached;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 5; depth++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
        name?: string;
        version?: string;
      };
      if (pkg.name === "designrail" && typeof pkg.version === "string") {
        cached = pkg.version;
        return cached;
      }
    } catch {
      // keep walking up
    }
    dir = dirname(dir);
  }
  return "0.0.0-unknown";
}

/** Absolute path to this package's root directory (where templates/ lives). */
export function packageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 5; depth++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: string };
      if (pkg.name === "designrail") return dir;
    } catch {
      // keep walking up
    }
    dir = dirname(dir);
  }
  throw new Error("Could not locate the designrail package root");
}
