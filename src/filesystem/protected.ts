import picomatch from "picomatch";

/**
 * Paths DesignRail never reads as source, regardless of include patterns:
 * secrets, dependencies, VCS data, build output, coverage, lockfiles.
 */
export const PROTECTED_DIRECTORY_NAMES = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".output",
  ".vercel",
  ".netlify",
  ".turbo",
  ".svelte-kit",
  ".cache",
  ".parcel-cache",
  ".vite",
  "coverage",
  "storybook-static",
]);

const PROTECTED_FILE_PATTERNS = [
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "*.crt",
  "*.cer",
  "*.der",
  "*.jks",
  "*.keystore",
  "id_rsa*",
  "id_dsa*",
  "id_ecdsa*",
  "id_ed25519*",
  ".npmrc",
  ".netrc",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
];

const protectedFileMatcher = picomatch(PROTECTED_FILE_PATTERNS, { dot: true, nocase: true });

export interface ProtectionOptions {
  /** Project-relative directories holding DesignRail-generated output (reports, tasks). */
  generatedDirectories: string[];
}

/** Returns a reason string when the project-relative path must never be scanned, otherwise null. */
export function protectedReason(relPath: string, options: ProtectionOptions): string | null {
  const segments = relPath.split("/").filter(Boolean);
  for (const segment of segments.slice(0, -1)) {
    if (PROTECTED_DIRECTORY_NAMES.has(segment)) return `inside protected directory "${segment}"`;
  }
  const last = segments.at(-1) ?? "";
  if (PROTECTED_DIRECTORY_NAMES.has(last)) return `protected directory "${last}"`;
  if (protectedFileMatcher(last)) return "secret, credential, or lockfile";
  for (const dir of options.generatedDirectories) {
    if (dir && (relPath === dir || relPath.startsWith(`${dir}/`))) return "DesignRail-generated output";
  }
  return null;
}
