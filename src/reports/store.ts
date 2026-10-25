import { formatZodIssues } from "../config/load.js";
import { resolveInsideRoot } from "../filesystem/paths.js";
import { atomicWrite, readIfExists } from "../filesystem/safe-write.js";
import type { ProjectContext } from "../project/context.js";
import { DesignRailError, errorMessage } from "../utilities/errors.js";
import { reportSchema, type CheckReport } from "./schema.js";

export const LATEST_REPORT = "latest.json";
export const LATEST_FIX_PROMPT = "latest-fix-prompt.md";

export function latestReportPath(project: ProjectContext): string {
  return `${project.config.reports.directory}/${LATEST_REPORT}`;
}

export function fixPromptPath(project: ProjectContext): string {
  return `${project.config.reports.directory}/${LATEST_FIX_PROMPT}`;
}

export function serializeReport(report: CheckReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function writeReport(project: ProjectContext, relPath: string, report: CheckReport): string {
  resolveInsideRoot(project.root, relPath, "report path");
  atomicWrite(project.root, relPath, serializeReport(report));
  return relPath;
}

/** Reads and validates a stored report. Throws DesignRailError when missing or invalid. */
export function readReport(project: ProjectContext, relPath: string): CheckReport {
  const text = readIfExists(project.root, relPath);
  if (text === null) {
    throw new DesignRailError("stale-report", `No report found at ${relPath}`, {
      hint: "Run `designrail check` first, or pass --refresh to run it now.",
    });
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new DesignRailError("stale-report", `${relPath} is not valid JSON`, {
      details: [errorMessage(error)],
      hint: "Rerun `designrail check`.",
    });
  }
  const parsed = reportSchema.safeParse(data);
  if (!parsed.success) {
    throw new DesignRailError("stale-report", `${relPath} does not match the DesignRail report schema`, {
      details: formatZodIssues(parsed.error).slice(0, 10),
      hint: "Rerun `designrail check` with this version of DesignRail.",
    });
  }
  return parsed.data;
}
