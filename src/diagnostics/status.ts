import { existsSync } from "node:fs";
import { join } from "node:path";
import { planSync, type SyncItem } from "../adapters/sync.js";
import { docState } from "../adapters/render.js";
import { CONFIG_PATH } from "../config/load.js";
import { RULE_IDS, type RuleId } from "../config/schema.js";
import { realRoot } from "../filesystem/paths.js";
import { loadProject, type ProjectContext } from "../project/context.js";
import { reportFreshness } from "../reports/freshness.js";
import type { CheckReport } from "../reports/schema.js";
import { latestReportPath, readReport } from "../reports/store.js";
import { TOKEN_TYPES, type TokenType } from "../tokens/schema.js";
import { errorMessage, isDesignRailError } from "../utilities/errors.js";
import { detectProject } from "../project/detect.js";

export interface AdapterState {
  id: string;
  path: string;
  state: "up-to-date" | "missing" | "stale" | "blocked";
  problem?: string;
}

export interface StatusResult {
  initialized: boolean;
  root: string;
  error?: { message: string; details: string[] };
  project?: { name: string; framework: string; tailwind: string; css: boolean };
  tokens?: {
    count: number;
    byType: Partial<Record<TokenType, number>>;
    unresolved: number;
    problems: string[];
  };
  components?: { count: number; missingSourceFiles: string[] };
  rules?: { enabled: RuleId[]; disabled: RuleId[]; failOn: string };
  adapters?: AdapterState[];
  lastCheck?: {
    path: string;
    generatedAt: string;
    status: CheckReport["result"]["status"];
    summary: CheckReport["summary"];
    fresh: boolean;
    staleReasons: string[];
  } | null;
  gaps: string[];
}

export function adapterStates(items: SyncItem[]): AdapterState[] {
  return items.map((item) => ({
    id: item.id,
    path: item.path,
    state:
      item.status === "unchanged"
        ? "up-to-date"
        : item.status === "create"
          ? "missing"
          : item.status === "blocked"
            ? "blocked"
            : "stale",
    ...(item.problem ? { problem: item.problem.message } : {}),
  }));
}

export function lastCheckSummary(project: ProjectContext): StatusResult["lastCheck"] {
  const path = latestReportPath(project);
  if (!existsSync(join(project.root, path))) return null;
  try {
    const report = readReport(project, path);
    const freshness = reportFreshness(project, report);
    return {
      path,
      generatedAt: report.generatedAt,
      status: report.result.status,
      summary: report.summary,
      fresh: freshness.fresh,
      staleReasons: freshness.reasons,
    };
  } catch (error) {
    return {
      path,
      generatedAt: "",
      status: "incomplete",
      summary: emptySummary(),
      fresh: false,
      staleReasons: [errorMessage(error)],
    };
  }
}

function emptySummary(): CheckReport["summary"] {
  return {
    filesScanned: 0,
    filesFullyAnalyzed: 0,
    filesPartiallyAnalyzed: 0,
    parseFailures: 0,
    errors: 0,
    warnings: 0,
    infos: 0,
    suppressed: 0,
    excepted: 0,
    unsupportedPatterns: 0,
  };
}

export function projectStatus(cwd: string): StatusResult {
  const root = realRoot(cwd);
  if (!existsSync(join(root, CONFIG_PATH))) {
    return { initialized: false, root, gaps: ["DesignRail is not initialized. Run `designrail init`."] };
  }
  let project: ProjectContext;
  try {
    project = loadProject(root);
  } catch (error) {
    return {
      initialized: true,
      root,
      error: { message: errorMessage(error), details: isDesignRailError(error) ? error.details : [] },
      gaps: ["Fix the configuration error above (see `designrail doctor`)."],
    };
  }
  const { config, registry } = project;
  const byType: Partial<Record<TokenType, number>> = {};
  for (const type of TOKEN_TYPES) {
    const n = registry.tokens.filter((t) => t.type === type).length;
    if (n > 0) byType[type] = n;
  }
  const missingSourceFiles = project.componentFile.components
    .filter((c) => !existsSync(join(root, c.sourceFile)))
    .map((c) => c.sourceFile);
  const adapters = adapterStates(planSync(project));
  const lastCheck = lastCheckSummary(project);
  const enabled = RULE_IDS.filter((id) => config.rules[id].enabled);

  const gaps: string[] = [];
  if (registry.tokens.length === 0) gaps.push("No tokens registered. Run `designrail import-tokens <file>`.");
  if (registry.problems.length > 0)
    gaps.push(`${registry.problems.length} token problem(s); run \`designrail doctor\`.`);
  if (project.componentFile.components.length === 0)
    gaps.push("No components registered. Run `designrail add-component <Name> <path>`.");
  if (missingSourceFiles.length > 0)
    gaps.push(`Registered component files are missing: ${missingSourceFiles.join(", ")}.`);
  for (const [label, path] of [
    ["design rules", config.paths.designRules],
    ["accessibility rules", config.paths.accessibilityRules],
    ["product context", config.paths.productContext],
  ] as const) {
    const state = docState(project, path);
    if (state === "starter")
      gaps.push(
        `${path} still contains starter guidance (${label}); customize it and remove the starter marker.`,
      );
    if (state === "missing") gaps.push(`${path} is missing.`);
  }
  if (adapters.some((a) => a.state === "missing" || a.state === "stale"))
    gaps.push("Generated AI instructions are missing or stale. Run `designrail sync`.");
  if (adapters.some((a) => a.state === "blocked"))
    gaps.push(
      "An adapter file is blocked (malformed markers, collision, or manual edits). Run `designrail sync --dry-run` for details.",
    );
  if (!lastCheck) gaps.push("No check report yet. Run `designrail check`.");
  else if (!lastCheck.fresh) gaps.push("The latest check report is stale. Rerun `designrail check`.");
  if (!detectProject(root).designrailInstalled && /\bdesignrail\b/.test(config.commands.check)) {
    gaps.push(
      "designrail is not listed in package.json. Install it as a dev dependency so generated instructions run a pinned version.",
    );
  }

  return {
    initialized: true,
    root,
    project: {
      name: config.project.name,
      framework: config.project.framework,
      tailwind: config.project.styling.tailwind,
      css: config.project.styling.css,
    },
    tokens: {
      count: registry.tokens.length,
      byType,
      unresolved: registry.tokens.filter((t) => t.resolved === undefined).length,
      problems: registry.problems.map((p) => p.message),
    },
    components: { count: project.componentFile.components.length, missingSourceFiles },
    rules: {
      enabled,
      disabled: RULE_IDS.filter((id) => !config.rules[id].enabled),
      failOn: config.check.failOn,
    },
    adapters,
    lastCheck,
    gaps,
  };
}
