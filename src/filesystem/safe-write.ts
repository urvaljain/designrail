import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { DesignRailError } from "../utilities/errors.js";
import { resolveInsideRoot } from "./paths.js";

export interface WriteOptions {
  /** Fail if the file already exists (used for files the user may own). */
  mustNotExist?: boolean;
}

/**
 * Writes a file inside the project root atomically: content goes to a temporary sibling,
 * then is renamed into place. Refuses to write through symlinks or outside the root.
 */
export function atomicWrite(
  root: string,
  relPath: string,
  content: string,
  options: WriteOptions = {},
): string {
  const { absolute } = resolveInsideRoot(root, relPath, "output path");
  if (existsSync(absolute) || isDanglingSymlink(absolute)) {
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      throw new DesignRailError("unsafe-path", `Refusing to write through a symbolic link: ${relPath}`);
    }
    if (stat.isDirectory()) {
      throw new DesignRailError("unsafe-path", `Refusing to replace a directory with a file: ${relPath}`);
    }
    if (options.mustNotExist) {
      throw new DesignRailError("collision", `File already exists and will not be overwritten: ${relPath}`);
    }
  }
  ensureDirectory(root, dirname(absolute));
  const temp = join(
    dirname(absolute),
    `.${basename(absolute)}.designrail-${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    writeFileSync(temp, content, { encoding: "utf8", flag: "wx" });
    if (options.mustNotExist && existsSync(absolute)) {
      throw new DesignRailError("collision", `File already exists and will not be overwritten: ${relPath}`);
    }
    renameSync(temp, absolute);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
  return absolute;
}

function isDanglingSymlink(absolute: string): boolean {
  try {
    return lstatSync(absolute).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Creates a directory (and parents) after verifying it stays inside the root. */
export function ensureDirectory(root: string, absoluteDir: string): void {
  resolveInsideRoot(root, absoluteDir, "directory");
  if (existsSync(absoluteDir)) {
    const stat = lstatSync(absoluteDir);
    if (!stat.isDirectory()) {
      throw new DesignRailError("unsafe-path", `Expected a directory but found a file: ${absoluteDir}`);
    }
    return;
  }
  mkdirSync(absoluteDir, { recursive: true });
}

/** Reads a UTF-8 file inside the project root, or returns null when it does not exist. */
export function readIfExists(root: string, relPath: string): string | null {
  const { absolute } = resolveInsideRoot(root, relPath, "path");
  if (!existsSync(absolute)) return null;
  const stat = lstatSync(absolute);
  if (stat.isDirectory()) {
    throw new DesignRailError("usage", `Expected a file but found a directory: ${relPath}`);
  }
  return readFileSync(absolute, "utf8");
}
