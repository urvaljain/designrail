import { existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { DesignRailError } from "../utilities/errors.js";

/** Converts a native relative path to forward slashes. */
export function toPosix(path: string): string {
  return sep === "\\" ? path.replace(/\\/g, "/") : path;
}

export function realRoot(root: string): string {
  const abs = resolve(root);
  if (!existsSync(abs)) {
    throw new DesignRailError("usage", `Project root does not exist: ${abs}`);
  }
  return realpathSync(abs);
}

function isInside(root: string, candidate: string): boolean {
  if (candidate === root) return true;
  const rel = relative(root, candidate);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** Deepest ancestor of `abs` (inclusive) that exists on disk. */
function deepestExisting(abs: string): string {
  let current = abs;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

export interface ResolvedPath {
  /** Absolute path (not symlink-resolved) inside the project root. */
  absolute: string;
  /** Project-relative path with forward slashes. "" means the root itself. */
  relative: string;
}

/**
 * Resolves a user-supplied or configured path against the project root and rejects anything
 * that escapes it: `..` traversal, absolute paths elsewhere, or symlinks pointing outside.
 */
export function resolveInsideRoot(root: string, input: string, purpose = "path"): ResolvedPath {
  if (input.includes("\0")) {
    throw new DesignRailError("unsafe-path", `Refusing ${purpose} containing a NUL byte`);
  }
  const absolute = resolve(root, input);
  if (!isInside(root, absolute)) {
    throw new DesignRailError("unsafe-path", `Refusing ${purpose} outside the project root: ${input}`, {
      hint: "Use a path inside the project (see --cwd).",
    });
  }
  const existing = deepestExisting(absolute);
  const real = realpathSync(existing);
  if (!isInside(root, real)) {
    throw new DesignRailError(
      "unsafe-path",
      `Refusing ${purpose} that resolves through a symlink outside the project root: ${input}`,
    );
  }
  return { absolute, relative: toPosix(relative(root, absolute)) };
}

/** True when the path exists and is a symbolic link (does not follow it). */
export function isSymlink(absolute: string): boolean {
  try {
    return lstatSync(absolute).isSymbolicLink();
  } catch {
    return false;
  }
}

export function joinRel(...parts: string[]): string {
  return toPosix(join(...parts));
}

/** Normalizes a configured project-relative path ("./src//x/" -> "src/x"). */
export function normalizeRelative(input: string): string {
  const normalized = toPosix(join(".", input)).replace(/\/+$/, "");
  return normalized === "." ? "" : normalized;
}
