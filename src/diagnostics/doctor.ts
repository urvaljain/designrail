import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import picomatch from "picomatch";
import { planSync } from "../adapters/sync.js";
import { scanManagedSection } from "../adapters/markers.js";
import { CONFIG_PATH } from "../config/load.js";
import { ADAPTER_IDS, DEFAULT_ADAPTER_PATHS } from "../config/schema.js";
import { decideExportKind, inferExports } from "../components/exports.js";
import { resolveSpecifier } from "../checker/rules/dr008-component-imports.js";
import { realRoot } from "../filesystem/paths.js";
import { walkFiles } from "../filesystem/walk.js";
import { readIfExists } from "../filesystem/safe-write.js";
import { loadProject, type ProjectContext } from "../project/context.js";
import { lastCheckSummary } from "./status.js";
import { errorMessage, isDesignRailError } from "../utilities/errors.js";
import { plural } from "../utilities/text.js";
import { languageOf } from "../checker/parsers/source.js";

export type DoctorCategory =
  "configuration-error" | "missing-capability" | "unsupported-syntax" | "design-violation" | "setup";

export interface DoctorCheck {
  id: string;
  category: DoctorCategory;
  status: "ok" | "warn" | "error";
  message: string;
  details?: string[];
  hint?: string;
}

export interface DoctorResult {
  root: string;
  checks: DoctorCheck[];
  exitCode: 0 | 2;
}

/** Engine requirement from package.json, checked without extra dependencies. */
export function nodeVersionSupported(version: string): boolean {
  const [major = 0, minor = 0] = version.replace(/^v/, "").split(".").map(Number);
  if (major === 22) return minor >= 18;
  if (major === 24) return minor >= 11;
  return major > 24;
}

function packageVersion(name: string): string {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve(`${name}/package.json`);
    return (JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string }).version;
  } catch {
    return "unknown";
  }
}

export function runDoctor(cwd: string): DoctorResult {
  const root = realRoot(cwd);
  const checks: DoctorCheck[] = [];
  const add = (check: DoctorCheck) => checks.push(check);

  add(
    nodeVersionSupported(process.versions.node)
      ? {
          id: "runtime",
          category: "setup",
          status: "ok",
          message: `Node.js ${process.versions.node} is supported`,
        }
      : {
          id: "runtime",
          category: "configuration-error",
          status: "error",
          message: `Node.js ${process.versions.node} is not supported`,
          hint: "Use Node.js ^22.18.0 or >=24.11.0.",
        },
  );
  add({
    id: "parsers",
    category: "setup",
    status: "ok",
    message: `Parsing: TS/TSX/JS/JSX via @babel/parser ${packageVersion("@babel/parser")}, CSS via postcss ${packageVersion("postcss")}. SCSS, Less, Vue, Svelte, MDX, and CSS-in-JS are not parsed.`,
  });

  if (!existsSync(join(root, CONFIG_PATH))) {
    add({
      id: "config",
      category: "configuration-error",
      status: "error",
      message: `${CONFIG_PATH} not found`,
      hint: "Run `designrail init`.",
    });
    return { root, checks, exitCode: 2 };
  }
  let project: ProjectContext;
  try {
    project = loadProject(root);
    add({ id: "config", category: "setup", status: "ok", message: `${CONFIG_PATH} is valid` });
  } catch (error) {
    add({
      id: "config",
      category: "configuration-error",
      status: "error",
      message: errorMessage(error),
      ...(isDesignRailError(error) ? { details: error.details } : {}),
    });
    return { root, checks, exitCode: 2 };
  }

  // Tokens
  const { registry } = project;
  const blocking = registry.problems.filter((p) => p.kind === "alias-cycle" || p.kind === "missing-alias");
  const soft = registry.problems.filter((p) => !blocking.includes(p));
  if (blocking.length > 0)
    add({
      id: "tokens.references",
      category: "configuration-error",
      status: "error",
      message: `${plural(blocking.length, "token reference problem")} (alias cycles or missing targets)`,
      details: blocking.map((p) => p.message),
    });
  if (soft.length > 0)
    add({
      id: "tokens.consistency",
      category: "configuration-error",
      status: "warn",
      message: `${plural(soft.length, "token consistency problem")}`,
      details: soft.map((p) => p.message),
    });
  if (registry.tokens.length === 0)
    add({
      id: "tokens",
      category: "setup",
      status: "warn",
      message: "No tokens registered",
      hint: "Run `designrail import-tokens <file>`.",
    });
  else if (blocking.length === 0)
    add({
      id: "tokens",
      category: "setup",
      status: "ok",
      message: `${plural(registry.tokens.length, "token")} registered; aliases resolve without cycles`,
    });
  const unresolved = registry.tokens.filter((t) => t.unresolved);
  if (unresolved.length > 0) {
    add({
      id: "tokens.unresolved",
      category: "unsupported-syntax",
      status: "warn",
      message: `${plural(unresolved.length, "token")} with values DesignRail cannot resolve statically (references remain usable)`,
      details: unresolved.slice(0, 10).map((t) => `${t.name}: ${t.unresolved}`),
    });
  }
  const unreferenced = registry.tokens.filter(
    (t) => !t.references?.cssVariables?.length && !t.references?.tailwindKeys?.length,
  );
  if (unreferenced.length > 0) {
    add({
      id: "tokens.references-missing",
      category: "setup",
      status: "warn",
      message: `${plural(unreferenced.length, "token")} without a CSS variable or Tailwind key; code cannot reference them in a checkable way`,
      details: unreferenced.slice(0, 10).map((t) => t.name),
    });
  }

  // Components
  const componentProblems: string[] = [];
  const componentWarnings: string[] = [];
  for (const c of project.componentFile.components) {
    const text = readIfExists(root, c.sourceFile);
    if (text === null) {
      componentProblems.push(`${c.exportName}: source file ${c.sourceFile} not found`);
      continue;
    }
    try {
      const decision = decideExportKind(inferExports(text, c.sourceFile), c.exportName);
      if (decision.reliable && decision.kind !== c.exportKind)
        componentWarnings.push(
          `${c.exportName}: registered as ${c.exportKind} export but the file exports it as ${decision.kind}`,
        );
      if (!decision.reliable) componentWarnings.push(`${c.exportName}: ${decision.reason}`);
    } catch (error) {
      componentWarnings.push(`${c.exportName}: could not parse ${c.sourceFile} (${errorMessage(error)})`);
    }
    for (const f of c.implementationFiles)
      if (!existsSync(join(root, f)))
        componentProblems.push(`${c.exportName}: implementation file ${f} not found`);
    const resolved = resolveSpecifier(c.importSpecifier, c.sourceFile, project.config.source.importAliases);
    const sourceModule = c.sourceFile.replace(/\.(tsx|ts|jsx|js|mts|mjs)$/, "").replace(/\/index$/, "");
    if (resolved.length > 0 && !resolved.includes(sourceModule))
      componentWarnings.push(
        `${c.exportName}: import specifier "${c.importSpecifier}" resolves to ${resolved.join(" or ")}, not ${c.sourceFile}`,
      );
  }
  if (componentProblems.length > 0)
    add({
      id: "components.files",
      category: "configuration-error",
      status: "error",
      message: `${plural(componentProblems.length, "component path problem")}`,
      details: componentProblems,
    });
  if (componentWarnings.length > 0)
    add({
      id: "components.exports",
      category: "configuration-error",
      status: "warn",
      message: `${plural(componentWarnings.length, "component registration warning")}`,
      details: componentWarnings,
    });
  if (
    project.componentFile.components.length > 0 &&
    componentProblems.length === 0 &&
    componentWarnings.length === 0
  ) {
    add({
      id: "components",
      category: "setup",
      status: "ok",
      message: `${plural(project.componentFile.components.length, "registered component")}; source files and exports verified`,
    });
  } else if (project.componentFile.components.length === 0) {
    add({
      id: "components",
      category: "setup",
      status: "warn",
      message: "No components registered (DR004 and DR008 have nothing to check)",
    });
  }

  // Adapters and markers
  const items = planSync(project);
  for (const item of items) {
    if (item.status === "unchanged")
      add({
        id: `adapter.${item.id}`,
        category: "setup",
        status: "ok",
        message: `${item.path} is up to date`,
      });
    else if (item.status === "blocked") {
      const kind = item.problem!.kind;
      add({
        id: `adapter.${item.id}`,
        category: "configuration-error",
        status: kind === "manual-edit" ? "warn" : "error",
        message: item.problem!.message,
        details: item.problem!.details,
      });
    } else
      add({
        id: `adapter.${item.id}`,
        category: "setup",
        status: "warn",
        message: `${item.path} is ${item.status === "create" ? "missing" : "out of date"}`,
        hint: "Run `designrail sync`.",
      });
  }
  const configured = new Set(items.map((i) => i.path));
  for (const id of ADAPTER_IDS) {
    const path = DEFAULT_ADAPTER_PATHS[id];
    if (configured.has(path)) continue;
    const text = readIfExists(root, path);
    if (text === null) continue;
    const scan = scanManagedSection(text);
    if (scan.kind === "malformed")
      add({
        id: `markers.${id}`,
        category: "configuration-error",
        status: "error",
        message: `${path} has malformed DesignRail markers`,
        details: scan.problems,
      });
    else if (scan.kind === "ok")
      add({
        id: `markers.${id}`,
        category: "setup",
        status: "warn",
        message: `${path} has a DesignRail section, but the ${id} adapter is not configured; it will not be updated`,
      });
  }

  // Include/exclude
  const walked = walkFiles(root, ["."], {
    generatedDirectories: [project.config.reports.directory, project.config.paths.tasks],
  });
  const include = picomatch(project.config.source.include, { dot: true });
  const exclude = picomatch(project.config.source.exclude, { dot: true });
  const matched = walked.files.filter((f) => include(f) && !exclude(f));
  const supported = matched.filter((f) => languageOf(f));
  const unsupported = matched.filter((f) => !languageOf(f));
  if (supported.length === 0)
    add({
      id: "source.patterns",
      category: "configuration-error",
      status: "warn",
      message: "source.include matches no supported files",
      details: project.config.source.include,
    });
  else
    add({
      id: "source.patterns",
      category: "setup",
      status: "ok",
      message: `source patterns match ${plural(supported.length, "checkable file")}`,
    });
  if (unsupported.length > 0) {
    add({
      id: "source.unsupported",
      category: "unsupported-syntax",
      status: "warn",
      message: `${plural(unsupported.length, "matched file")} use unsupported file types and will be skipped`,
      details: unsupported.slice(0, 10),
    });
  }
  const otherStyles = walked.files.filter((f) =>
    /\.(scss|sass|less|styl|vue|svelte|astro|mdx)$/.test(f),
  ).length;
  if (otherStyles > 0)
    add({
      id: "capability.styles",
      category: "missing-capability",
      status: "warn",
      message: `${plural(otherStyles, "file")} in formats DesignRail cannot parse (SCSS, Less, Vue, Svelte, Astro, MDX)`,
    });

  // Report freshness and design violations
  const last = lastCheckSummary(project);
  if (!last)
    add({
      id: "report",
      category: "setup",
      status: "warn",
      message: "No check report yet",
      hint: "Run `designrail check`.",
    });
  else if (!last.fresh)
    add({
      id: "report",
      category: "setup",
      status: "warn",
      message: `${last.path} is stale`,
      details: last.staleReasons,
      hint: "Rerun `designrail check`.",
    });
  else {
    add({
      id: "report",
      category: "setup",
      status: "ok",
      message: `${last.path} is current (${last.generatedAt})`,
    });
    const s = last.summary;
    add({
      id: "design",
      category: "design-violation",
      status: s.errors + s.warnings > 0 ? "warn" : "ok",
      message: `Latest check: ${plural(s.errors, "error")}, ${plural(s.warnings, "warning")}, ${plural(s.unsupportedPatterns, "unanalyzed pattern")}`,
      ...(s.errors + s.warnings > 0
        ? { hint: "Run `designrail fix-prompt` to create a repair prompt." }
        : {}),
    });
  }

  return { root, checks, exitCode: checks.some((c) => c.status === "error") ? 2 : 0 };
}
