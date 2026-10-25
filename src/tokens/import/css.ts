import postcss, { type AtRule, type ChildNode, type Container, type Declaration, type Rule } from "postcss";
import { normalizeValue, soleVarReference, splitTopLevelCommas } from "../../checker/parsers/css-values.js";
import type { TokenType } from "../schema.js";
import { inferCssVariable, plausibleForType } from "./infer.js";
import { TYPE_GROUP, type ImportOptions, type ImportResult, type ImportedToken } from "./types.js";

const ROOT_SELECTORS = new Set([":root", "html", ":host"]);

/** Tailwind v4 theme namespaces DesignRail models, in match order. Verified against tailwindcss@4.3 theme.css. */
const V4_NAMESPACES: [string, TokenType][] = [
  ["font-weight-", "fontWeight"],
  ["breakpoint-", "breakpoint"],
  ["spacing-", "spacing"],
  ["leading-", "lineHeight"],
  ["radius-", "radius"],
  ["shadow-", "shadow"],
  ["color-", "color"],
  ["font-", "fontFamily"],
  ["text-", "fontSize"],
];

export function parseFamilyList(value: string): string[] {
  return splitTopLevelCommas(value)
    .map((f) => f.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function tokenValue(type: TokenType, raw: string): string | string[] {
  const value = normalizeValue(raw);
  if (type === "fontFamily" && !soleVarReference(value)) return parseFamilyList(value);
  return value;
}

function selectorIsRoot(rule: Rule): boolean {
  return rule.selectors.some((s) => ROOT_SELECTORS.has(s.trim()));
}

function ancestorsAllowed(node: ChildNode): { ok: boolean; at?: string } {
  let parent: Container | undefined = node.parent as Container | undefined;
  while (parent && parent.type !== "root") {
    if (parent.type === "atrule") {
      const name = (parent as AtRule).name;
      if (name !== "layer" && name !== "theme") return { ok: false, at: `@${name}` };
    }
    parent = parent.parent as Container | undefined;
  }
  return { ok: true };
}

interface Pending {
  variable: string;
  value: string;
  line: number;
}

/**
 * Imports CSS custom properties from :root/html/:host rules (optionally inside @layer) and,
 * for Tailwind v4, from @theme blocks. Theme-variant selectors (.dark, [data-theme]) and
 * media-scoped declarations are reported as skipped: only base values are imported.
 */
export function importCss(
  text: string,
  sourceFile: string,
  options: ImportOptions,
  mode: "css" | "tailwind-v4",
): ImportResult {
  const root = postcss.parse(text, { from: sourceFile });
  const result: ImportResult = {
    format: mode,
    sourceFile,
    tokens: [],
    attachments: [],
    skipped: [],
    notes: [],
  };
  const rootVars: Pending[] = [];
  const themeVars: (Pending & { inline: boolean })[] = [];
  let sawTheme = false;

  root.walkDecls((decl: Declaration) => {
    if (!decl.prop.startsWith("--")) return;
    const line = decl.source?.start?.line ?? 1;
    const parent = decl.parent;
    if (parent?.type === "atrule" && (parent as AtRule).name === "theme") {
      sawTheme = true;
      const params = (parent as AtRule).params;
      themeVars.push({ variable: decl.prop, value: decl.value, line, inline: /\binline\b/.test(params) });
      return;
    }
    if (parent?.type !== "rule") {
      result.skipped.push({ name: decl.prop, reason: "declared outside a rule", line });
      return;
    }
    const allowed = ancestorsAllowed(parent as Rule);
    if (!allowed.ok) {
      result.skipped.push({
        name: decl.prop,
        reason: `inside ${allowed.at}; only base values are imported`,
        line,
      });
      return;
    }
    if (!selectorIsRoot(parent as Rule)) {
      result.skipped.push({
        name: decl.prop,
        reason: `declared in "${(parent as Rule).selector}" (theme variant or scoped value); only :root/html/:host values are imported`,
        line,
      });
      return;
    }
    rootVars.push({ variable: decl.prop, value: decl.value, line });
  });

  const byVariable = new Map<string, ImportedToken>();
  const names = new Set<string>();
  const add = (entry: ImportedToken, variable: string): void => {
    if (names.has(entry.name)) {
      result.skipped.push({ name: variable, reason: `duplicate token name ${entry.name}` });
      return;
    }
    names.add(entry.name);
    byVariable.set(variable, entry);
    result.tokens.push(entry);
  };

  // A later declaration of the same variable in a root rule wins, like the cascade would.
  const lastRoot = new Map<string, Pending>();
  for (const v of rootVars) lastRoot.set(v.variable, v);

  for (const v of lastRoot.values()) {
    let inference = inferCssVariable(v.variable, v.value);
    if (!inference.type && options.assumeType && plausibleForType(options.assumeType, v.value)) {
      inference = { type: options.assumeType, rest: v.variable.replace(/^--/, "") };
    }
    if (!inference.type) {
      result.skipped.push({
        name: v.variable,
        reason: inference.reason ?? "type is ambiguous",
        line: v.line,
      });
      continue;
    }
    add(
      makeToken(
        inference.type,
        `${TYPE_GROUP[inference.type]}.${inference.rest}`,
        v,
        sourceFile,
        mode,
        [v.variable],
        [],
      ),
      v.variable,
    );
  }

  for (const v of themeVars) {
    const bare = v.variable.replace(/^--/, "");
    if (/^[a-z-]+-\*$/.test(bare) || bare === "*") {
      result.notes.push(
        `@theme reset ${v.variable}: ${v.value} (namespace reset; default theme values are not modeled)`,
      );
      continue;
    }
    if (bare === "spacing") {
      add(
        makeToken(
          "spacing",
          "spacing.base",
          v,
          sourceFile,
          "tailwind-v4",
          v.inline ? [] : [v.variable],
          [],
          "Tailwind v4 spacing multiplier: numeric utilities such as p-4 compute calc(var(--spacing) * 4).",
        ),
        v.variable,
      );
      result.notes.push(
        "Imported --spacing (Tailwind v4 spacing multiplier). Numeric utilities like p-4 stay unverified unless policies.tailwind.numericSpacing is set to allow or flag.",
      );
      continue;
    }
    if (/--[a-z-]+$/.test(bare) && bare.includes("--")) {
      result.skipped.push({
        name: v.variable,
        reason: "sub-property (for example --text-sm--line-height) is not modeled",
        line: v.line,
      });
      continue;
    }
    const ns = V4_NAMESPACES.find(([prefix]) => bare.startsWith(prefix) && bare.length > prefix.length);
    if (!ns) {
      result.skipped.push({
        name: v.variable,
        reason: "Tailwind theme namespace not modeled by DesignRail",
        line: v.line,
      });
      continue;
    }
    const [prefix, type] = ns;
    const key = bare.slice(prefix.length);
    const referenced = soleVarReference(v.value);
    if (referenced) {
      const owner = byVariable.get(referenced);
      if (owner && owner.token.type === type) {
        addReferences(owner, key, v.inline ? undefined : v.variable);
        continue;
      }
      if (!owner) {
        result.attachments.push({
          cssVariable: referenced,
          type,
          tailwindKey: key,
          ...(v.inline ? {} : { extraCssVariable: v.variable }),
          origin: `${v.variable} (line ${v.line})`,
          fallback: makeToken(
            type,
            `${TYPE_GROUP[type]}.${key}`,
            v,
            sourceFile,
            "tailwind-v4",
            v.inline ? [] : [v.variable],
            [key],
          ),
        });
        continue;
      }
    }
    if (!plausibleForType(type, v.value)) {
      result.skipped.push({
        name: v.variable,
        reason: `value "${v.value}" does not fit ${type}`,
        line: v.line,
      });
      continue;
    }
    add(
      makeToken(
        type,
        `${TYPE_GROUP[type]}.${key}`,
        v,
        sourceFile,
        "tailwind-v4",
        v.inline ? [] : [v.variable],
        [key],
      ),
      v.variable,
    );
  }

  if (mode === "tailwind-v4" && !sawTheme)
    result.notes.push("No @theme block found; imported plain custom properties only.");
  if (mode === "css" && sawTheme)
    result.notes.push("Found @theme blocks; treated them as Tailwind v4 theme variables.");
  return result;
}

function addReferences(entry: ImportedToken, tailwindKey: string, cssVariable: string | undefined): void {
  const refs = entry.token.references ?? {};
  const keys = new Set(refs.tailwindKeys ?? []);
  keys.add(tailwindKey);
  const vars = new Set(refs.cssVariables ?? []);
  if (cssVariable) vars.add(cssVariable);
  entry.token.references = { cssVariables: [...vars].sort(), tailwindKeys: [...keys].sort() };
}

function makeToken(
  type: TokenType,
  name: string,
  v: Pending,
  sourceFile: string,
  format: string,
  cssVariables: string[],
  tailwindKeys: string[],
  description?: string,
): ImportedToken {
  const value = tokenValue(type, v.value);
  const referenced = typeof value === "string" ? soleVarReference(value) : null;
  const unresolved = referenced
    ? `references ${referenced}`
    : typeof value === "string" && /^(calc|clamp|min|max)\(/i.test(value)
      ? "computed expression"
      : undefined;
  return {
    name,
    token: {
      type,
      value,
      ...(description ? { description } : {}),
      references: {
        ...(cssVariables.length ? { cssVariables } : {}),
        ...(tailwindKeys.length ? { tailwindKeys } : {}),
      },
      ...(unresolved ? { unresolved } : {}),
      source: { file: sourceFile, format },
    },
  };
}
