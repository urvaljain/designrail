import { readFileSync } from "node:fs";
import picomatch from "picomatch";
import type { RuleId, Severity } from "../config/schema.js";
import { resolveInsideRoot } from "../filesystem/paths.js";
import { walkFiles, type SkippedPath } from "../filesystem/walk.js";
import { assertTokensUsable, projectFingerprints, type ProjectContext } from "../project/context.js";
import {
  REPORT_SCHEMA_VERSION,
  type CheckReport,
  type CoverageNote,
  type ParseFailure,
  type SuppressionRecord,
  type Violation,
} from "../reports/schema.js";
import { sha256 } from "../utilities/hash.js";
import { compareStrings, plural } from "../utilities/text.js";
import { toolVersion } from "../version.js";
import { analyzeCss } from "./analysis/css.js";
import { analyzeModule } from "./analysis/tsx.js";
import { languageOf, parseSource } from "./parsers/source.js";
import { RULES } from "./rules/index.js";
import type { CoverageItem, EmittedFinding, FileAnalysis, Language, RuleContext } from "./types.js";

export interface CheckOptions {
  /** Project-relative paths to check. Defaults to the whole project ("."). */
  paths?: string[];
  strict?: boolean;
  now?: Date;
}

const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2 };

function minSeverity(a: Severity, b: Severity | undefined): Severity {
  if (!b) return a;
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}

export interface CollectedFiles {
  files: string[];
  skipped: SkippedPath[];
  scope: string[];
}

/** Lists files in scope after protections and include/exclude, including for explicit paths. */
export function collectFiles(project: ProjectContext, paths: string[] | undefined): CollectedFiles {
  const scope = (paths && paths.length > 0 ? paths : ["."]).map(
    (p) => resolveInsideRoot(project.root, p, "check path").relative || ".",
  );
  const generated = [project.config.reports.directory, project.config.paths.tasks];
  const walked = walkFiles(project.root, scope, { generatedDirectories: generated });
  const include = picomatch(project.config.source.include, { dot: true });
  const exclude = picomatch(project.config.source.exclude, { dot: true });
  const explicitFiles = new Set(scope);
  const files: string[] = [];
  const skipped = [...walked.skipped];
  for (const file of walked.files) {
    const explicit = explicitFiles.has(file);
    if (!include(file)) {
      if (explicit) skipped.push({ path: file, reason: "not matched by source.include" });
      continue;
    }
    if (exclude(file)) {
      if (explicit) skipped.push({ path: file, reason: "matched by source.exclude" });
      continue;
    }
    if (!languageOf(file)) {
      skipped.push({
        path: file,
        reason: "unsupported file type (supported: .tsx .jsx .ts .js .mjs .cjs .mts .cts .css)",
      });
      continue;
    }
    files.push(file);
  }
  return { files, skipped: dedupeSkipped(skipped), scope };
}

function dedupeSkipped(items: SkippedPath[]): SkippedPath[] {
  const seen = new Map<string, SkippedPath>();
  for (const item of items) if (!seen.has(item.path)) seen.set(item.path, item);
  return [...seen.values()].sort((a, b) => compareStrings(a.path, b.path));
}

function emptyAnalysis(
  path: string,
  language: Language,
  content: string,
  isTokenDefinitionFile: boolean,
): FileAnalysis {
  return {
    path,
    language,
    content,
    declarations: [],
    classTokens: [],
    elements: [],
    styleAttributes: [],
    imports: [],
    labelTargets: { static: new Set(), expressions: new Set() },
    localCustomProperties: new Set(),
    coverage: [],
    suppressions: [],
    isTokenDefinitionFile,
  };
}

export interface FileResult {
  path: string;
  sha256: string;
  analysis: FileAnalysis | null;
  parseFailure: ParseFailure | null;
}

/** Parses one file once and collects the facts every rule shares. */
export function analyzeFile(project: ProjectContext, path: string, content: string): FileResult {
  const language = languageOf(path)!;
  const isDefinition = project.config.tokens.definitionFiles.includes(path);
  const analysis = emptyAnalysis(path, language, content, isDefinition);
  const hash = sha256(content);
  if (language === "css") {
    const failure = analyzeCss(analysis);
    if (failure) return { path, sha256: hash, analysis: null, parseFailure: { file: path, ...failure } };
    return { path, sha256: hash, analysis, parseFailure: null };
  }
  const parsed = parseSource(content, language);
  if (!parsed.ok)
    return { path, sha256: hash, analysis: null, parseFailure: { file: path, ...parsed.error } };
  const labelComponents = project.componentFile.components
    .filter((c) => c.replaces.includes("label"))
    .map((c) => c.exportName);
  analyzeModule(analysis, parsed.ast, {
    classFunctions: project.config.source.classFunctions,
    labelComponents,
  });
  return { path, sha256: hash, analysis, parseFailure: null };
}

/** Runs enabled rules against a file analysis. Returns raw findings before suppression and exceptions. */
export function runRules(project: ProjectContext, analysis: FileAnalysis): EmittedFinding[] {
  const findings: EmittedFinding[] = [];
  for (const rule of RULES) {
    const settings = project.config.rules[rule.id];
    if (!settings.enabled || !rule.languages.includes(analysis.language)) continue;
    const context: RuleContext = {
      project,
      file: analysis,
      report: (finding) => findings.push({ ...finding, ruleId: rule.id }),
      coverage: (item: CoverageItem) => analysis.coverage.push(item),
      priorFindings: () => findings,
    };
    rule.check(context);
  }
  return findings;
}

function exceptionMatches(project: ProjectContext, finding: EmittedFinding, file: string): boolean {
  return project.config.exceptions.some((exception) => {
    if (exception.rule !== finding.ruleId) return false;
    if (exception.files && !picomatch(exception.files, { dot: true })(file)) return false;
    if (exception.values && !exception.values.some((v) => v.toLowerCase() === finding.subject.toLowerCase()))
      return false;
    return true;
  });
}

function sortByLocation<T extends { file: string; line: number; column: number }>(
  items: T[],
  tie: (a: T, b: T) => number = () => 0,
): T[] {
  return items.sort(
    (a, b) => compareStrings(a.file, b.file) || a.line - b.line || a.column - b.column || tie(a, b),
  );
}

export function effectiveFailOn(
  project: ProjectContext,
  strict: boolean,
): CheckReport["policy"]["effectiveFailOn"] {
  return strict ? "warning" : project.config.check.failOn;
}

/** Checks files in scope and builds a report. Never modifies source files. */
export function runCheck(project: ProjectContext, options: CheckOptions = {}): CheckReport {
  assertTokensUsable(project);
  const strict = options.strict ?? false;
  const collected = collectFiles(project, options.paths);
  const violations: Violation[] = [];
  const unsupported: CoverageNote[] = [];
  const parseFailures: ParseFailure[] = [];
  const suppressions: SuppressionRecord[] = [];
  const files: CheckReport["files"] = [];
  let suppressedCount = 0;
  let exceptedCount = 0;

  for (const path of collected.files) {
    const { absolute } = resolveInsideRoot(project.root, path, "source file");
    const content = readFileSync(absolute, "utf8");
    const result = analyzeFile(project, path, content);
    if (!result.analysis) {
      parseFailures.push(result.parseFailure!);
      files.push({ path, sha256: result.sha256, analysis: "parse-error" });
      continue;
    }
    const analysis = result.analysis;
    const findings = runRules(project, analysis);
    const used = new Set<number>();
    for (const finding of findings) {
      const directiveIndex = analysis.suppressions.findIndex(
        (d) => d.valid && d.targetLine === finding.loc.line && d.rules.includes(finding.ruleId),
      );
      if (directiveIndex >= 0) {
        used.add(directiveIndex);
        suppressedCount++;
        continue;
      }
      if (exceptionMatches(project, finding, path)) {
        exceptedCount++;
        continue;
      }
      const severity = minSeverity(
        project.config.rules[finding.ruleId as RuleId].severity,
        finding.maxSeverity,
      );
      violations.push({
        ruleId: finding.ruleId,
        severity,
        confidence: finding.confidence,
        file: path,
        line: finding.loc.line,
        column: finding.loc.column,
        message: finding.message,
        evidence: finding.evidence,
        suggestion: finding.suggestion,
        ...(finding.token ? { token: finding.token } : {}),
        ...(finding.component ? { component: finding.component } : {}),
      });
    }
    analysis.suppressions.forEach((d, index) => {
      suppressions.push({
        file: path,
        line: d.loc.line,
        column: d.loc.column,
        rules: d.rules,
        reason: d.reason,
        status: !d.valid ? "invalid" : used.has(index) ? "used" : "unused",
      });
      if (!d.valid) {
        violations.push({
          ruleId: "DR000",
          severity: "warning",
          confidence: "high",
          file: path,
          line: d.loc.line,
          column: d.loc.column,
          message: `Invalid suppression comment: it ${d.problem}`,
          evidence: `designrail-ignore-next-line ${d.rules.join(",")}${d.reason ? ` -- ${d.reason}` : ""}`,
          suggestion:
            "Use: designrail-ignore-next-line DR00X -- <reason>. The finding below it is still reported.",
        });
      }
    });
    const seenCoverage = new Set<string>();
    for (const item of analysis.coverage) {
      const key = `${item.loc.line}:${item.loc.column}:${item.kind}:${item.detail}`;
      if (seenCoverage.has(key)) continue;
      seenCoverage.add(key);
      unsupported.push({
        file: path,
        line: item.loc.line,
        column: item.loc.column,
        kind: item.kind,
        detail: item.detail,
      });
    }
    files.push({ path, sha256: result.sha256, analysis: seenCoverage.size > 0 ? "partial" : "complete" });
  }

  sortByLocation(
    violations,
    (a, b) => compareStrings(a.ruleId, b.ruleId) || compareStrings(a.message, b.message),
  );
  sortByLocation(unsupported, (a, b) => compareStrings(a.kind, b.kind) || compareStrings(a.detail, b.detail));
  sortByLocation(parseFailures);
  sortByLocation(suppressions);
  files.sort((a, b) => compareStrings(a.path, b.path));

  const count = (s: Severity) => violations.filter((v) => v.severity === s).length;
  const errors = count("error");
  const warnings = count("warning");
  const failOn = project.config.check.failOn;
  const effective = effectiveFailOn(project, strict);
  const failing = effective === "error" ? errors : effective === "warning" ? errors + warnings : 0;
  const partial = files.filter((f) => f.analysis === "partial").length;

  let result: CheckReport["result"];
  if (parseFailures.length > 0) {
    result = {
      status: "incomplete",
      exitCode: 2,
      reason: `${plural(parseFailures.length, "file")} could not be parsed; results are partial and the run is not clean.`,
    };
  } else if (failing > 0) {
    result = {
      status: "fail",
      exitCode: 1,
      reason: `${plural(failing, "finding")} at or above the failure threshold (${effective}).`,
    };
  } else {
    result = {
      status: "pass",
      exitCode: 0,
      reason:
        `No findings at or above the failure threshold (${effective}).` +
        (partial > 0
          ? ` ${plural(partial, "file")} contained patterns DesignRail could not analyze; see "unsupported".`
          : ""),
    };
  }

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    tool: { name: "designrail", version: toolVersion() },
    generatedAt: (options.now ?? new Date()).toISOString(),
    scope: { paths: collected.scope, strict },
    policy: { failOn, effectiveFailOn: effective },
    fingerprints: projectFingerprints(project),
    files,
    summary: {
      filesScanned: files.length,
      filesFullyAnalyzed: files.filter((f) => f.analysis === "complete").length,
      filesPartiallyAnalyzed: partial,
      parseFailures: parseFailures.length,
      errors,
      warnings,
      infos: count("info"),
      suppressed: suppressedCount,
      excepted: exceptedCount,
      unsupportedPatterns: unsupported.length,
    },
    violations,
    parseFailures,
    unsupported,
    skipped: collected.skipped,
    suppressions,
    result,
  };
}
