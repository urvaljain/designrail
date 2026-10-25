import type { ProjectContext } from "../../project/context.js";
import type { RegistryToken } from "../../tokens/registry.js";
import type { TokenType } from "../../tokens/schema.js";
import { tailwindExamples } from "../../tokens/usage.js";
import { parseDimension } from "../parsers/css-values.js";
import type { FileAnalysis } from "../types.js";

export function tailwindEnabled(project: ProjectContext): boolean {
  return project.config.project.styling.tailwind !== "none";
}

export function tokenForVariable(project: ProjectContext, name: string): RegistryToken | undefined {
  return project.registry.byCssVariable.get(name);
}

export function tokenForKey(
  project: ProjectContext,
  type: TokenType,
  key: string,
): RegistryToken | undefined {
  return project.registry.byTailwindKey.get(type)?.get(key);
}

/** True when the project registers at least one token with a CSS variable, so unknown variables are meaningful. */
export function hasCssTokens(project: ProjectContext): boolean {
  return project.registry.byCssVariable.size > 0;
}

/** Variables defined in the same file, or Tailwind's internal --tw-* variables, are not design-token drift. */
export function isLocalOrInternalVariable(file: FileAnalysis, name: string): boolean {
  return file.localCustomProperties.has(name) || name.startsWith("--tw-");
}

/** Where a suggestion will be applied: a CSS/inline-style value, or a Tailwind class with a given prefix. */
export type HintContext = { kind: "css" } | { kind: "class"; prefix: string };

export const CSS_CONTEXT: HintContext = { kind: "css" };

/** How to reference a token in the given context: "var(--color-brand)" for CSS, "bg-brand" for classes. */
export function referenceHint(
  project: ProjectContext,
  token: RegistryToken,
  context: HintContext = CSS_CONTEXT,
): string {
  const variable = token.references?.cssVariables?.[0];
  const key = token.references?.tailwindKeys?.[0];
  if (context.kind === "class") {
    if (key) return key === "DEFAULT" ? context.prefix : `${context.prefix}-${key}`;
    if (variable)
      return project.config.project.styling.tailwind === "v4"
        ? `${context.prefix}-(${variable})`
        : `${context.prefix}-[var(${variable})]`;
  } else {
    if (variable) return `var(${variable})`;
    if (key && tailwindEnabled(project))
      return `the Tailwind utility ${tailwindExamples(token.type, key)[0]}`;
  }
  return `token ${token.name} (no code reference registered)`;
}

export function normalizeColor(value: string): string {
  let v = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*([(),/])\s*/g, "$1");
  const hex = /^#([0-9a-f]{3,4})$/.exec(v);
  if (hex) v = `#${[...hex[1]!].map((ch) => ch + ch).join("")}`;
  if (/^#[0-9a-f]{8}$/.test(v) && v.endsWith("ff")) v = v.slice(0, 7);
  return v;
}

export function tokensWithValue(
  project: ProjectContext,
  type: TokenType,
  matches: (resolved: string) => boolean,
): RegistryToken[] {
  return project.registry.tokens.filter(
    (t) => t.type === type && typeof t.resolved === "string" && matches(t.resolved),
  );
}

export function colorTokensEqualTo(project: ProjectContext, literal: string): RegistryToken[] {
  const target = normalizeColor(literal);
  return tokensWithValue(project, "color", (v) => normalizeColor(v) === target);
}

/** Converts a dimension to px when possible (px directly, rem/em only with an explicit remBasePx). */
export function toPx(value: string, remBasePx: number | null): number | null {
  const dim = parseDimension(value);
  if (!dim) return null;
  if (dim.unit === "px") return dim.number;
  if (dim.number === 0) return 0;
  if ((dim.unit === "rem" || dim.unit === "em") && remBasePx !== null) return dim.number * remBasePx;
  return null;
}

/** Spacing tokens whose resolved value equals `value` (same unit, or converted with remBasePx). */
export function spacingTokensEqualTo(project: ProjectContext, value: string): RegistryToken[] {
  const dim = parseDimension(value);
  if (!dim) return [];
  const base = project.config.policies.remBasePx;
  const px = toPx(value, base);
  return tokensWithValue(project, "spacing", (resolved) => {
    const other = parseDimension(resolved);
    if (!other) return false;
    if (other.unit === dim.unit && other.number === Math.abs(dim.number)) return true;
    const otherPx = toPx(resolved, base);
    return px !== null && otherPx !== null && otherPx === Math.abs(px);
  });
}

/** Up to two nearest spacing tokens comparable with `value` (same unit or convertible). */
export function nearestSpacingTokens(project: ProjectContext, value: string): RegistryToken[] {
  const dim = parseDimension(value);
  if (!dim) return [];
  const base = project.config.policies.remBasePx;
  const target = toPx(value, base);
  const scored: { token: RegistryToken; distance: number }[] = [];
  for (const token of project.registry.tokens) {
    if (token.type !== "spacing" || typeof token.resolved !== "string") continue;
    const other = parseDimension(token.resolved);
    if (!other) continue;
    if (other.unit === dim.unit)
      scored.push({ token, distance: Math.abs(other.number - Math.abs(dim.number)) });
    else {
      const otherPx = toPx(token.resolved, base);
      if (target !== null && otherPx !== null)
        scored.push({ token, distance: Math.abs(otherPx - Math.abs(target)) });
    }
  }
  return scored
    .sort((a, b) => a.distance - b.distance || a.token.name.localeCompare(b.token.name))
    .slice(0, 2)
    .map((s) => s.token);
}

export function describeTokens(
  project: ProjectContext,
  tokens: RegistryToken[],
  context: HintContext = CSS_CONTEXT,
): string {
  return tokens
    .map(
      (t) =>
        `${referenceHint(project, t, context)} (${t.name} = ${Array.isArray(t.resolved) ? t.resolved.join(", ") : String(t.resolved)})`,
    )
    .join(" or ");
}

export function classEvidence(raw: string): string {
  return `class "${raw}"`;
}

export function declarationEvidence(decl: { property: string; value: string; fromNumber?: boolean }): string {
  if (decl.fromNumber && decl.value.endsWith("px"))
    return `${decl.property}: ${decl.value.slice(0, -2)} (numeric inline style, rendered as ${decl.value})`;
  return `${decl.property}: ${decl.value}`;
}
