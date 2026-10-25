import type { RuleId, Severity } from "../config/schema.js";
import type { ProjectContext } from "../project/context.js";
import type { Confidence } from "../reports/schema.js";
import type { ParsedClass } from "./parsers/tailwind.js";

export type Language = "tsx" | "jsx" | "ts" | "js" | "css";

export interface Loc {
  line: number;
  column: number;
}

export interface StyleDeclaration {
  /** Lowercase kebab-case property; custom properties keep their name ("--brand"). */
  property: string;
  value: string;
  loc: Loc;
  origin: "css" | "jsx-style";
  isCustomPropertyDefinition: boolean;
  inThemeBlock: boolean;
  /** JSX numeric literal converted to px (React semantics), e.g. padding: 16 -> "16px". */
  fromNumber: boolean;
  /** Index into FileAnalysis.styleAttributes for JSX inline styles. */
  styleAttribute?: number;
}

export interface ClassToken {
  raw: string;
  loc: Loc;
  parsed: ParsedClass;
  origin: "jsx" | "class-function" | "css-apply";
}

export type AttrValue =
  | { kind: "string"; value: string }
  | { kind: "boolean" }
  | { kind: "empty" }
  | { kind: "nullish"; text: string }
  | { kind: "expression"; text: string };

export interface JsxElementInfo {
  name: string;
  intrinsic: boolean;
  attributes: Map<string, AttrValue>;
  hasSpread: boolean;
  loc: Loc;
  insideLabel: boolean;
  isComponentRoot: boolean;
}

export interface StyleAttributeInfo {
  element: string;
  loc: Loc;
  kind: "object" | "dynamic";
  declarations: number[];
  dynamicParts: number;
}

export interface ImportInfo {
  source: string;
  specifiers: { imported: string; local: string }[];
  loc: Loc;
}

export interface CoverageItem {
  loc: Loc;
  kind: string;
  detail: string;
}

export interface SuppressionDirective {
  /** Line the directive applies to (the line after the comment ends). */
  targetLine: number;
  loc: Loc;
  rules: string[];
  reason: string;
  valid: boolean;
  problem?: string;
}

export interface FileAnalysis {
  path: string;
  language: Language;
  content: string;
  declarations: StyleDeclaration[];
  classTokens: ClassToken[];
  elements: JsxElementInfo[];
  styleAttributes: StyleAttributeInfo[];
  imports: ImportInfo[];
  labelTargets: { static: Set<string>; expressions: Set<string> };
  localCustomProperties: Set<string>;
  coverage: CoverageItem[];
  suppressions: SuppressionDirective[];
  isTokenDefinitionFile: boolean;
}

export interface RuleFinding {
  loc: Loc;
  message: string;
  evidence: string;
  suggestion: string;
  confidence: Confidence;
  /** Value used to match config exceptions (a color, class, element, or import source). */
  subject: string;
  /** Caps the reported severity (e.g. unregistered CSS variables are at most warnings). */
  maxSeverity?: Severity;
  token?: string;
  component?: string;
}

export interface EmittedFinding extends RuleFinding {
  ruleId: RuleId;
}

export interface RuleContext {
  project: ProjectContext;
  file: FileAnalysis;
  report(finding: RuleFinding): void;
  coverage(item: CoverageItem): void;
  /** Findings already reported for this file by earlier rules (used to avoid duplicates). */
  priorFindings(): readonly EmittedFinding[];
}

export interface Rule {
  id: RuleId;
  name: string;
  description: string;
  defaultSeverity: Severity;
  languages: readonly Language[];
  check(context: RuleContext): void;
}
