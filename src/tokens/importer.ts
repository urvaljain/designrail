import { addToStringList, updateConfigYaml } from "../config/update.js";
import { resolveInsideRoot } from "../filesystem/paths.js";
import { atomicWrite, readIfExists } from "../filesystem/safe-write.js";
import type { ProjectContext } from "../project/context.js";
import { DesignRailError } from "../utilities/errors.js";
import {
  detectFormat,
  mergeTokens,
  runImport,
  type ImportFormat,
  type ImportOptions,
  type ImportResult,
  type MergeOutcome,
} from "./import/index.js";
import { serializeTokenFile } from "./load.js";
import type { TokenProblem } from "./registry.js";

export interface ImportTokensOptions extends ImportOptions {
  format?: ImportFormat;
  replace?: boolean;
  dryRun?: boolean;
}

export interface ImportTokensResult {
  source: string;
  format: ImportFormat;
  parsed: ImportResult;
  merge: MergeOutcome;
  written: boolean;
  definitionFileAdded: boolean;
  newProblems: TokenProblem[];
}

/**
 * Imports tokens into the project's token file. Nothing is written when parsing fails,
 * when the merged result would contain missing aliases or cycles, or with dryRun.
 */
export function importTokens(
  project: ProjectContext,
  file: string,
  options: ImportTokensOptions = {},
): ImportTokensResult {
  const { relative } = resolveInsideRoot(project.root, file, "token source");
  const text = readIfExists(project.root, relative);
  if (text === null) throw new DesignRailError("usage", `Token source not found: ${file}`);
  const format = options.format ?? detectFormat(relative, text);
  const parsed = runImport(relative, text, format, options);
  const merge = mergeTokens(project.tokenFile, parsed, { replace: options.replace ?? false });

  const before = new Set(project.registry.problems.map((p) => p.message));
  const newProblems = merge.problems.filter(
    (p) =>
      !before.has(p.message) &&
      (p.kind === "alias-cycle" || p.kind === "missing-alias" || p.kind === "duplicate-reference"),
  );
  if (newProblems.length > 0) {
    throw new DesignRailError(
      "parse",
      `Import of ${relative} would make ${project.config.paths.tokens} inconsistent`,
      {
        details: newProblems.map((p) => p.message),
        hint: "Nothing was written. Fix the source, or rename conflicting tokens, then retry.",
      },
    );
  }

  const modified = merge.added.length + merge.changed.length + merge.replaced.length > 0;
  let written = false;
  let definitionFileAdded = false;
  if (!options.dryRun && modified) {
    atomicWrite(project.root, project.config.paths.tokens, serializeTokenFile(merge.file));
    written = true;
  }
  const definesTokens =
    (format === "css" || format === "tailwind-v4") && merge.added.length + merge.changed.length > 0;
  if (!options.dryRun && definesTokens && !project.config.tokens.definitionFiles.includes(relative)) {
    updateConfigYaml(project.root, project.configText, (doc) => {
      definitionFileAdded = addToStringList(doc, ["tokens", "definitionFiles"], relative);
    });
  } else if (options.dryRun && definesTokens && !project.config.tokens.definitionFiles.includes(relative)) {
    definitionFileAdded = true;
  }
  return { source: relative, format, parsed, merge, written, definitionFileAdded, newProblems };
}
