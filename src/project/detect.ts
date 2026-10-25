import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readIfExists } from "../filesystem/safe-write.js";
import { parseJsonc } from "../utilities/jsonc.js";

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export interface Detection {
  packageJson: boolean;
  projectName: string | null;
  framework: "react" | "next" | "unknown";
  frameworkEvidence: string[];
  tailwind: "v3" | "v4" | "none";
  tailwindEvidence: string[];
  packageManager: PackageManager;
  sourceDirectories: string[];
  importAliases: Record<string, string[]>;
  aliasEvidence: string | null;
  tokenCandidates: string[];
  scripts: Record<string, string>;
  designrailInstalled: boolean;
  /** Where Claude Code project instructions already live, if only .claude/CLAUDE.md exists. */
  claudeInstructionsPath: "CLAUDE.md" | ".claude/CLAUDE.md";
}

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  packageManager?: string;
}

function readPackageJson(root: string): PackageJson | null {
  const text = readIfExists(root, "package.json");
  if (text === null) return null;
  try {
    return JSON.parse(text) as PackageJson;
  } catch {
    return null;
  }
}

function majorOf(range: string | undefined): number | null {
  if (!range) return null;
  const match = /(\d+)(?:\.\d+)*/.exec(range);
  return match ? Number(match[1]) : null;
}

const CANDIDATE_DIRS = ["src", "app", "pages", "components"];
const TAILWIND_CONFIG_FILES = [
  "tailwind.config.js",
  "tailwind.config.cjs",
  "tailwind.config.mjs",
  "tailwind.config.ts",
  "tailwind.config.mts",
  "tailwind.config.cts",
];

/** Inspects project files without executing anything. */
export function detectProject(root: string): Detection {
  const pkg = readPackageJson(root);
  const deps = { ...pkg?.peerDependencies, ...pkg?.devDependencies, ...pkg?.dependencies };

  const frameworkEvidence: string[] = [];
  let framework: Detection["framework"] = "unknown";
  if (deps.next) {
    framework = "next";
    frameworkEvidence.push(`package.json depends on next@${deps.next}`);
  } else if (deps.react) {
    framework = "react";
    frameworkEvidence.push(`package.json depends on react@${deps.react}`);
  }
  if (
    framework === "unknown" &&
    ["next.config.js", "next.config.mjs", "next.config.ts"].some((f) => existsSync(join(root, f)))
  ) {
    framework = "next";
    frameworkEvidence.push("next.config file present");
  }

  const tailwindEvidence: string[] = [];
  let tailwind: Detection["tailwind"] = "none";
  const twMajor = majorOf(deps.tailwindcss);
  const twConfig = TAILWIND_CONFIG_FILES.find((f) => existsSync(join(root, f)));
  if (twMajor !== null) {
    tailwind = twMajor >= 4 ? "v4" : "v3";
    tailwindEvidence.push(`package.json depends on tailwindcss@${deps.tailwindcss}`);
  } else if (deps["@tailwindcss/vite"] || deps["@tailwindcss/postcss"]) {
    tailwind = "v4";
    tailwindEvidence.push("package.json depends on a @tailwindcss/* v4 integration");
  } else if (twConfig) {
    tailwind = "v3";
    tailwindEvidence.push(`${twConfig} present`);
  }
  if (twConfig) tailwindEvidence.push(`${twConfig} present`);

  const sourceDirectories = CANDIDATE_DIRS.filter((d) => isDir(join(root, d)));

  let importAliases: Record<string, string[]> = {};
  let aliasEvidence: string | null = null;
  for (const file of ["tsconfig.json", "jsconfig.json"]) {
    const aliases = readPathAliases(root, file);
    if (aliases && Object.keys(aliases).length > 0) {
      importAliases = aliases;
      aliasEvidence = file;
      break;
    }
  }

  return {
    packageJson: pkg !== null,
    projectName: pkg?.name ?? null,
    framework,
    frameworkEvidence,
    tailwind,
    tailwindEvidence: [...new Set(tailwindEvidence)],
    packageManager: detectPackageManager(root, pkg),
    sourceDirectories,
    importAliases,
    aliasEvidence,
    tokenCandidates: findTokenCandidates(root, sourceDirectories, twConfig),
    scripts: pkg?.scripts ?? {},
    designrailInstalled: Boolean(deps.designrail),
    claudeInstructionsPath:
      !existsSync(join(root, "CLAUDE.md")) && existsSync(join(root, ".claude", "CLAUDE.md"))
        ? ".claude/CLAUDE.md"
        : "CLAUDE.md",
  };
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function detectPackageManager(root: string, pkg: PackageJson | null): PackageManager {
  const declared = pkg?.packageManager?.split("@")[0];
  if (declared === "pnpm" || declared === "npm" || declared === "yarn" || declared === "bun") return declared;
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))) return "bun";
  return "npm";
}

/** Reads compilerOptions.paths (relative to baseUrl or the config directory) without evaluating anything. */
function readPathAliases(root: string, file: string): Record<string, string[]> | null {
  const text = readIfExists(root, file);
  if (text === null) return null;
  let data: { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } };
  try {
    data = parseJsonc(text) as typeof data;
  } catch {
    return null;
  }
  const paths = data.compilerOptions?.paths;
  if (!paths || typeof paths !== "object") return null;
  const base = (data.compilerOptions?.baseUrl ?? ".").replace(/^\.\/?/, "").replace(/\/$/, "");
  const out: Record<string, string[]> = {};
  for (const [alias, targets] of Object.entries(paths)) {
    if (!Array.isArray(targets)) continue;
    out[alias] = targets
      .filter((t): t is string => typeof t === "string")
      .map((t) => {
        const clean = t.replace(/^\.\//, "");
        return base ? `${base}/${clean}` : clean;
      });
  }
  return out;
}

function findTokenCandidates(root: string, dirs: string[], twConfig: string | undefined): string[] {
  const out: string[] = [];
  if (twConfig) out.push(twConfig);
  for (const name of ["tokens.json", "design-tokens.json"]) if (existsSync(join(root, name))) out.push(name);
  const visit = (rel: string, depth: number): void => {
    if (depth > 3 || out.length > 20) return;
    let entries: string[];
    try {
      entries = readdirSync(join(root, rel)).sort();
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const child = `${rel}/${entry}`;
      if (isDir(join(root, child))) {
        visit(child, depth + 1);
      } else if (entry.endsWith(".css")) {
        const text = readIfExists(root, child) ?? "";
        if (/(^|[\s{;])--[A-Za-z0-9_-]+\s*:/.test(text)) out.push(child);
      } else if (/tokens?\.json$/i.test(entry)) {
        out.push(child);
      }
    }
  };
  for (const dir of dirs) visit(dir, 0);
  return [...new Set(out)];
}

export function includePatternsFor(dirs: string[]): string[] {
  const chosen = dirs.length > 0 ? dirs : ["src"];
  return chosen.map((d) => `${d}/**/*.{tsx,jsx,ts,js,css}`);
}

export function checkCommandFor(pm: PackageManager, scripts: Record<string, string>): string {
  const script = Object.entries(scripts).find(([, cmd]) => /\bdesignrail\s+check\b/.test(cmd));
  if (script) return pm === "npm" ? `npm run ${script[0]}` : `${pm} run ${script[0]}`;
  switch (pm) {
    case "pnpm":
      return "pnpm exec designrail check";
    case "yarn":
      return "yarn designrail check";
    case "bun":
      return "bunx designrail check";
    default:
      return "npx designrail check";
  }
}

export function projectChecksFor(pm: PackageManager, scripts: Record<string, string>): string[] {
  const run = pm === "npm" ? "npm run" : `${pm} run`;
  return ["lint", "typecheck", "type-check", "test"]
    .filter((name) => typeof scripts[name] === "string" && !/\bdesignrail\b/.test(scripts[name]!))
    .map((name) => `${run} ${name}`);
}
