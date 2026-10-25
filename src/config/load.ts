import { parseDocument } from "yaml";
import type { z } from "zod";
import { resolveInsideRoot, normalizeRelative } from "../filesystem/paths.js";
import { readIfExists } from "../filesystem/safe-write.js";
import { DesignRailError, errorMessage } from "../utilities/errors.js";
import { configSchema, type DesignRailConfig } from "./schema.js";

export const CONFIG_DIR = "designrail";
export const CONFIG_PATH = "designrail/config.yaml";

export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

/** Parses YAML text (data only: no custom tags, no code execution) and validates it. */
export function parseConfigText(text: string, label = CONFIG_PATH): DesignRailConfig {
  let data: unknown;
  try {
    const doc = parseDocument(text, { prettyErrors: true, logLevel: "silent" });
    if (doc.errors.length > 0) throw new Error(doc.errors.map((e) => e.message).join("\n"));
    if (doc.warnings.length > 0) {
      throw new DesignRailError("configuration", `${label} uses unsupported YAML features`, {
        details: doc.warnings.map((w) => w.message),
        hint: "DesignRail reads plain YAML data only (no custom tags).",
      });
    }
    data = doc.toJS({ maxAliasCount: 50 });
  } catch (error) {
    if (error instanceof DesignRailError) throw error;
    throw new DesignRailError("configuration", `${label} is not valid YAML`, {
      details: [errorMessage(error)],
    });
  }
  if (data === null || data === undefined) {
    throw new DesignRailError("configuration", `${label} is empty`, {
      hint: "Run `designrail init` to create a starter configuration.",
    });
  }
  const result = configSchema.safeParse(data);
  if (!result.success) {
    throw new DesignRailError("configuration", `${label} is invalid`, {
      details: formatZodIssues(result.error),
    });
  }
  return normalizeConfig(result.data);
}

function normalizeConfig(config: DesignRailConfig): DesignRailConfig {
  return {
    ...config,
    paths: {
      tokens: normalizeRelative(config.paths.tokens),
      components: normalizeRelative(config.paths.components),
      designRules: normalizeRelative(config.paths.designRules),
      accessibilityRules: normalizeRelative(config.paths.accessibilityRules),
      productContext: normalizeRelative(config.paths.productContext),
      tasks: normalizeRelative(config.paths.tasks),
    },
    tokens: { definitionFiles: config.tokens.definitionFiles.map(normalizeRelative) },
    reports: { ...config.reports, directory: normalizeRelative(config.reports.directory) },
    adapters: dedupeAdapters(config.adapters).map((a) =>
      a.path ? { ...a, path: normalizeRelative(a.path) } : a,
    ),
  };
}

function dedupeAdapters(adapters: DesignRailConfig["adapters"]): DesignRailConfig["adapters"] {
  const seen = new Set<string>();
  return adapters.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

/** Ensures every configured path stays inside the project root. */
export function validateConfigPaths(root: string, config: DesignRailConfig): void {
  const entries: [string, string][] = [
    ["paths.tokens", config.paths.tokens],
    ["paths.components", config.paths.components],
    ["paths.designRules", config.paths.designRules],
    ["paths.accessibilityRules", config.paths.accessibilityRules],
    ["paths.productContext", config.paths.productContext],
    ["paths.tasks", config.paths.tasks],
    ["reports.directory", config.reports.directory],
    ...config.tokens.definitionFiles.map((f, i): [string, string] => [`tokens.definitionFiles.${i}`, f]),
    ...config.adapters.filter((a) => a.path).map((a): [string, string] => [`adapters.${a.id}.path`, a.path!]),
  ];
  const problems: string[] = [];
  for (const [key, value] of entries) {
    try {
      resolveInsideRoot(root, value, key);
      if (value === "") problems.push(`${key}: must not be the project root`);
    } catch (error) {
      problems.push(`${key}: ${errorMessage(error)}`);
    }
  }
  if (problems.length > 0) {
    throw new DesignRailError("configuration", `${CONFIG_PATH} contains unsafe paths`, { details: problems });
  }
}

export function readConfig(root: string): { config: DesignRailConfig; text: string } | null {
  const text = readIfExists(root, CONFIG_PATH);
  if (text === null) return null;
  const config = parseConfigText(text);
  validateConfigPaths(root, config);
  return { config, text };
}
