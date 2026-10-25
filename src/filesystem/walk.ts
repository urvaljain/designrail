import { existsSync, lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { resolveInsideRoot, toPosix } from "./paths.js";
import { protectedReason, type ProtectionOptions } from "./protected.js";

export interface SkippedPath {
  path: string;
  reason: string;
}

export interface WalkResult {
  files: string[];
  skipped: SkippedPath[];
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}

/**
 * Lists files under the given project-relative starting points. Never follows symlinked
 * directories; follows symlinked files only when their target stays inside the root.
 * Protected paths (secrets, dependencies, build output, generated output) are skipped.
 * Results are sorted for deterministic output.
 */
export function walkFiles(root: string, starts: string[], protection: ProtectionOptions): WalkResult {
  const files = new Set<string>();
  const skipped: SkippedPath[] = [];

  const visit = (absolute: string, explicit: boolean): void => {
    const rel = toPosix(relative(root, absolute));
    if (rel !== "") {
      const reason = protectedReason(rel, protection);
      if (reason) {
        if (explicit) skipped.push({ path: rel, reason });
        return;
      }
    }
    let stat;
    try {
      stat = lstatSync(absolute);
    } catch {
      skipped.push({ path: rel, reason: "not found" });
      return;
    }
    if (stat.isSymbolicLink()) {
      let target: string;
      try {
        target = realpathSync(absolute);
      } catch {
        skipped.push({ path: rel, reason: "broken symbolic link" });
        return;
      }
      if (!inside(root, target)) {
        skipped.push({ path: rel, reason: "symbolic link points outside the project root" });
        return;
      }
      if (statSync(target).isDirectory()) {
        skipped.push({ path: rel, reason: "symbolic link to a directory is not followed" });
        return;
      }
      files.add(rel);
      return;
    }
    if (stat.isDirectory()) {
      const entries = readdirSync(absolute).sort();
      for (const entry of entries) visit(join(absolute, entry), false);
      return;
    }
    if (stat.isFile()) files.add(rel);
  };

  for (const start of starts) {
    const { absolute } = resolveInsideRoot(root, start, "scan path");
    if (!existsSync(absolute) && !isLink(absolute)) {
      skipped.push({ path: toPosix(relative(root, absolute)) || ".", reason: "not found" });
      continue;
    }
    visit(absolute, true);
  }
  return { files: [...files].sort(), skipped };
}

function isLink(absolute: string): boolean {
  try {
    return lstatSync(absolute).isSymbolicLink();
  } catch {
    return false;
  }
}
