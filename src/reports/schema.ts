import { z } from "zod";
import { RULE_IDS, SEVERITIES } from "../config/schema.js";

export const REPORT_SCHEMA_VERSION = 1;

export const CONFIDENCE_LEVELS = ["high", "medium"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

const location = {
  file: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
};

export const violationSchema = z.strictObject({
  ruleId: z.union([z.enum(RULE_IDS), z.literal("DR000")]),
  severity: z.enum(SEVERITIES),
  confidence: z.enum(CONFIDENCE_LEVELS),
  ...location,
  message: z.string(),
  evidence: z.string(),
  suggestion: z.string(),
  token: z.string().optional(),
  component: z.string().optional(),
});
export type Violation = z.infer<typeof violationSchema>;

export const coverageNoteSchema = z.strictObject({
  ...location,
  kind: z.string(),
  detail: z.string(),
});
export type CoverageNote = z.infer<typeof coverageNoteSchema>;

export const parseFailureSchema = z.strictObject({
  ...location,
  message: z.string(),
});
export type ParseFailure = z.infer<typeof parseFailureSchema>;

export const suppressionRecordSchema = z.strictObject({
  ...location,
  rules: z.array(z.string()),
  reason: z.string(),
  status: z.enum(["used", "unused", "invalid"]),
});
export type SuppressionRecord = z.infer<typeof suppressionRecordSchema>;

export const reportSchema = z.strictObject({
  schemaVersion: z.literal(REPORT_SCHEMA_VERSION),
  tool: z.strictObject({ name: z.literal("designrail"), version: z.string() }),
  generatedAt: z.string(),
  scope: z.strictObject({
    paths: z.array(z.string()),
    strict: z.boolean(),
  }),
  policy: z.strictObject({
    failOn: z.enum(["error", "warning", "never"]),
    effectiveFailOn: z.enum(["error", "warning", "never"]),
  }),
  fingerprints: z.strictObject({
    config: z.string(),
    tokens: z.string(),
    components: z.string(),
  }),
  files: z.array(
    z.strictObject({
      path: z.string(),
      sha256: z.string(),
      analysis: z.enum(["complete", "partial", "parse-error"]),
    }),
  ),
  summary: z.strictObject({
    filesScanned: z.number().int(),
    filesFullyAnalyzed: z.number().int(),
    filesPartiallyAnalyzed: z.number().int(),
    parseFailures: z.number().int(),
    errors: z.number().int(),
    warnings: z.number().int(),
    infos: z.number().int(),
    suppressed: z.number().int(),
    excepted: z.number().int(),
    unsupportedPatterns: z.number().int(),
  }),
  violations: z.array(violationSchema),
  parseFailures: z.array(parseFailureSchema),
  unsupported: z.array(coverageNoteSchema),
  skipped: z.array(z.strictObject({ path: z.string(), reason: z.string() })),
  suppressions: z.array(suppressionRecordSchema),
  result: z.strictObject({
    status: z.enum(["pass", "fail", "incomplete"]),
    exitCode: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    reason: z.string(),
  }),
});
export type CheckReport = z.infer<typeof reportSchema>;
