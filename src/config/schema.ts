import { z } from "zod";

export const CONFIG_SCHEMA_VERSION = 1;

export const RULE_IDS = ["DR001", "DR002", "DR003", "DR004", "DR005", "DR006", "DR007", "DR008"] as const;
export type RuleId = (typeof RULE_IDS)[number];

export const SEVERITIES = ["error", "warning", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const ADAPTER_IDS = ["codex", "claude-code", "cursor", "generic"] as const;
export type AdapterId = (typeof ADAPTER_IDS)[number];

export const DEFAULT_ADAPTER_PATHS: Record<AdapterId, string> = {
  codex: "AGENTS.md",
  "claude-code": "CLAUDE.md",
  cursor: ".cursor/rules/designrail.mdc",
  generic: "DESIGNRAIL_CONTEXT.md",
};

export const DEFAULT_INCLUDE = [
  "src/**/*.{tsx,jsx,ts,js,css}",
  "app/**/*.{tsx,jsx,ts,js,css}",
  "pages/**/*.{tsx,jsx,ts,js,css}",
  "components/**/*.{tsx,jsx,ts,js,css}",
];

export const DEFAULT_EXCLUDE = [
  "**/*.test.*",
  "**/*.spec.*",
  "**/__tests__/**",
  "**/__mocks__/**",
  "**/*.d.ts",
];

export const DEFAULT_CLASS_FUNCTIONS = [
  "cn",
  "clsx",
  "classnames",
  "classNames",
  "cx",
  "twMerge",
  "twJoin",
  "cva",
  "tv",
];

export const DEFAULT_FONT_FALLBACKS = [
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
  "-apple-system",
  "BlinkMacSystemFont",
];

const ruleSettings = (defaults: { severity: Severity }) =>
  z
    .strictObject({
      enabled: z.boolean().default(true),
      severity: z.enum(SEVERITIES).default(defaults.severity),
    })
    .prefault({});

export const DEFAULT_RULE_SEVERITY: Record<RuleId, Severity> = {
  DR001: "error",
  DR002: "error",
  DR003: "error",
  DR004: "error",
  DR005: "warning",
  DR006: "error",
  DR007: "error",
  DR008: "error",
};

const exceptionSchema = z.strictObject({
  rule: z.enum(RULE_IDS),
  files: z.array(z.string().min(1)).optional(),
  values: z.array(z.string().min(1)).optional(),
  reason: z.string().trim().min(3, "Every exception needs a reason"),
});
export type ConfigException = z.infer<typeof exceptionSchema>;

const adapterSchema = z.strictObject({
  id: z.enum(ADAPTER_IDS),
  path: z.string().min(1).optional(),
});

export const configSchema = z.strictObject({
  schemaVersion: z.literal(CONFIG_SCHEMA_VERSION),
  project: z
    .strictObject({
      name: z.string().min(1).default("my-project"),
      framework: z.enum(["react", "next", "unknown"]).default("react"),
      styling: z
        .strictObject({
          tailwind: z.enum(["v3", "v4", "none"]).default("none"),
          css: z.boolean().default(true),
        })
        .prefault({}),
    })
    .prefault({}),
  source: z
    .strictObject({
      include: z.array(z.string().min(1)).default(DEFAULT_INCLUDE),
      exclude: z.array(z.string().min(1)).default(DEFAULT_EXCLUDE),
      importAliases: z.record(z.string(), z.array(z.string())).default({}),
      classFunctions: z.array(z.string().min(1)).default(DEFAULT_CLASS_FUNCTIONS),
    })
    .prefault({}),
  paths: z
    .strictObject({
      tokens: z.string().min(1).default("designrail/tokens.json"),
      components: z.string().min(1).default("designrail/components.json"),
      designRules: z.string().min(1).default("designrail/design-rules.md"),
      accessibilityRules: z.string().min(1).default("designrail/accessibility-rules.md"),
      productContext: z.string().min(1).default("designrail/product-context.md"),
      tasks: z.string().min(1).default("designrail/tasks"),
    })
    .prefault({}),
  tokens: z
    .strictObject({
      /** Files that define tokens (exempt from raw-value rules). */
      definitionFiles: z.array(z.string().min(1)).default([]),
    })
    .prefault({}),
  policies: z
    .strictObject({
      /** forbid: raw values always need a token reference or exception. allow-matching-tokens: a raw value equal to a token value (same unit) passes. */
      rawValues: z.enum(["forbid", "allow-matching-tokens"]).default("forbid"),
      /** px per rem for comparing values across units. null = never equate px and rem. */
      remBasePx: z.number().positive().nullable().default(null),
      spacing: z
        .strictObject({
          zero: z.enum(["allow", "flag"]).default("allow"),
          auto: z.enum(["allow", "flag"]).default("allow"),
          percentages: z.enum(["allow", "flag"]).default("allow"),
          calc: z.enum(["tokens-only", "allow", "flag"]).default("tokens-only"),
        })
        .prefault({}),
      fontFallbacks: z.array(z.string().min(1)).default(DEFAULT_FONT_FALLBACKS),
      tailwind: z
        .strictObject({
          /** How numeric spacing utilities such as p-4 are treated. unknown = reported as a coverage limitation. */
          numericSpacing: z.enum(["unknown", "allow", "flag"]).default("unknown"),
          /** Tailwind default palette utilities such as bg-blue-500. */
          defaultPalette: z.enum(["flag", "allow"]).default("flag"),
        })
        .prefault({}),
      /** DR005 inline style policy. */
      inlineStyles: z.enum(["forbid", "allow-token-references", "allow"]).default("allow-token-references"),
      /** Elements DR006 treats as images. "Image" is checked only when imported from next/image. */
      imageElements: z.array(z.string().min(1)).default(["img"]),
    })
    .prefault({}),
  rules: z
    .strictObject({
      DR001: ruleSettings({ severity: DEFAULT_RULE_SEVERITY.DR001 }),
      DR002: ruleSettings({ severity: DEFAULT_RULE_SEVERITY.DR002 }),
      DR003: ruleSettings({ severity: DEFAULT_RULE_SEVERITY.DR003 }),
      DR004: ruleSettings({ severity: DEFAULT_RULE_SEVERITY.DR004 }),
      DR005: ruleSettings({ severity: DEFAULT_RULE_SEVERITY.DR005 }),
      DR006: ruleSettings({ severity: DEFAULT_RULE_SEVERITY.DR006 }),
      DR007: ruleSettings({ severity: DEFAULT_RULE_SEVERITY.DR007 }),
      DR008: ruleSettings({ severity: DEFAULT_RULE_SEVERITY.DR008 }),
    })
    .prefault({}),
  check: z
    .strictObject({
      /** Lowest severity that fails `designrail check`. --strict lowers this to "warning". */
      failOn: z.enum(["error", "warning", "never"]).default("error"),
    })
    .prefault({}),
  exceptions: z.array(exceptionSchema).default([]),
  responsive: z
    .strictObject({
      approach: z.enum(["mobile-first", "desktop-first", "unspecified"]).default("unspecified"),
      guidance: z.array(z.string().min(1)).default([]),
    })
    .prefault({}),
  adapters: z.array(adapterSchema).default([{ id: "codex" }, { id: "claude-code" }]),
  commands: z
    .strictObject({
      /** How the project invokes DesignRail; used in generated instructions. */
      check: z.string().min(1).default("npx designrail check"),
      /** Optional project checks the AI should run (lint, typecheck, test). */
      projectChecks: z.array(z.string().min(1)).default([]),
    })
    .prefault({}),
  reports: z
    .strictObject({
      enabled: z.boolean().default(true),
      directory: z.string().min(1).default("designrail/reports"),
    })
    .prefault({}),
});

export type DesignRailConfig = z.infer<typeof configSchema>;
export type ConfigInput = z.input<typeof configSchema>;

export function defaultConfig(overrides: Partial<ConfigInput> = {}): DesignRailConfig {
  return configSchema.parse({ schemaVersion: CONFIG_SCHEMA_VERSION, ...overrides });
}
