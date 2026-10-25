/**
 * DesignRail programmatic API. The CLI is a thin layer over these functions; none of them
 * write to stdout, make network requests, or execute project code.
 */
export {
  loadProject,
  assertTokensUsable,
  projectFingerprints,
  type ProjectContext,
} from "./project/context.js";
export { planInit, applyInit, type InitPlan, type InitSettings } from "./project/init.js";
export { detectProject, type Detection } from "./project/detect.js";
export {
  configSchema,
  defaultConfig,
  RULE_IDS,
  ADAPTER_IDS,
  type DesignRailConfig,
  type RuleId,
  type AdapterId,
  type Severity,
} from "./config/schema.js";
export { parseConfigText } from "./config/load.js";
export { tokenFileSchema, TOKEN_TYPES, type Token, type TokenFile, type TokenType } from "./tokens/schema.js";
export {
  buildRegistry,
  type TokenRegistry,
  type RegistryToken,
  type TokenProblem,
} from "./tokens/registry.js";
export { importTokens, type ImportTokensOptions, type ImportTokensResult } from "./tokens/importer.js";
export {
  runImport,
  detectFormat,
  mergeTokens,
  IMPORT_FORMATS,
  type ImportFormat,
  type ImportResult,
} from "./tokens/import/index.js";
export { componentFileSchema, type RegisteredComponent, type ComponentFile } from "./components/schema.js";
export { registerComponent, type RegisterOptions, type RegisterResult } from "./components/register.js";
export { planSync, applySync, hasDrift, type SyncItem, type SyncStatus } from "./adapters/sync.js";
export { renderInstructions } from "./adapters/render.js";
export { scanManagedSection, START_MARKER, END_MARKER } from "./adapters/markers.js";
export { renderTaskBrief, writeTask, suggestComponents } from "./tasks/brief.js";
export { runCheck, collectFiles, analyzeFile, runRules, type CheckOptions } from "./checker/engine.js";
export { RULES } from "./checker/rules/index.js";
export type { Rule, RuleContext, RuleFinding, FileAnalysis } from "./checker/types.js";
export { reportSchema, type CheckReport, type Violation } from "./reports/schema.js";
export { reportFreshness, type Freshness } from "./reports/freshness.js";
export { renderFixPrompt } from "./reports/fix-prompt.js";
export { readReport, writeReport } from "./reports/store.js";
export { projectStatus, type StatusResult } from "./diagnostics/status.js";
export { runDoctor, type DoctorResult, type DoctorCheck } from "./diagnostics/doctor.js";
export { DesignRailError, ExitCode } from "./utilities/errors.js";
export { runCli } from "./cli/index.js";
