import { readFileSync } from "node:fs";
import { collectFiles } from "../checker/engine.js";
import { resolveInsideRoot } from "../filesystem/paths.js";
import { projectFingerprints, type ProjectContext } from "../project/context.js";
import { sha256 } from "../utilities/hash.js";
import type { CheckReport } from "./schema.js";

export interface Freshness {
  fresh: boolean;
  reasons: string[];
}

/**
 * Compares a report with the current project: configuration, token and component fingerprints,
 * content hashes of every scanned file, and the set of files currently in scope.
 */
export function reportFreshness(project: ProjectContext, report: CheckReport): Freshness {
  const reasons: string[] = [];
  const current = projectFingerprints(project);
  if (current.config !== report.fingerprints.config)
    reasons.push("designrail/config.yaml changed since the report was generated");
  if (current.tokens !== report.fingerprints.tokens)
    reasons.push(`${project.config.paths.tokens} changed since the report was generated`);
  if (current.components !== report.fingerprints.components)
    reasons.push(`${project.config.paths.components} changed since the report was generated`);

  const changed: string[] = [];
  const missing: string[] = [];
  for (const file of report.files) {
    let hash: string | null;
    try {
      const { absolute } = resolveInsideRoot(project.root, file.path, "report file");
      hash = sha256(readFileSync(absolute, "utf8"));
    } catch {
      hash = null;
    }
    if (hash === null) missing.push(file.path);
    else if (hash !== file.sha256) changed.push(file.path);
  }
  const limit = (list: string[]) =>
    `${list.slice(0, 5).join(", ")}${list.length > 5 ? `, and ${list.length - 5} more` : ""}`;
  if (changed.length > 0) reasons.push(`files changed since the report: ${limit(changed)}`);
  if (missing.length > 0) reasons.push(`files no longer present: ${limit(missing)}`);

  try {
    const scanned = new Set(report.files.map((f) => f.path));
    const added = collectFiles(project, report.scope.paths).files.filter((f) => !scanned.has(f));
    if (added.length > 0) reasons.push(`new files in scope that were not checked: ${limit(added)}`);
  } catch (error) {
    reasons.push(`could not re-enumerate the report scope (${(error as Error).message})`);
  }
  return { fresh: reasons.length === 0, reasons };
}
