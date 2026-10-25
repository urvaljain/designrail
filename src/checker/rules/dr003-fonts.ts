import {
  CSS_WIDE_KEYWORDS,
  normalizeFamily,
  soleVarReference,
  splitTopLevelCommas,
} from "../parsers/css-values.js";
import { FONT_WEIGHT_KEYS } from "../parsers/tailwind.js";
import type { ProjectContext } from "../../project/context.js";
import type { RegistryToken } from "../../tokens/registry.js";
import type { ClassToken, Loc, Rule, RuleContext, StyleDeclaration } from "../types.js";
import {
  CSS_CONTEXT,
  type HintContext,
  classEvidence,
  declarationEvidence,
  hasCssTokens,
  isLocalOrInternalVariable,
  referenceHint,
  tokenForKey,
  tokenForVariable,
} from "./shared.js";

const TAILWIND_DEFAULT_FAMILIES = new Set(["sans", "serif", "mono"]);
const FONT_CLASS: HintContext = { kind: "class", prefix: "font" };

function familyTokens(project: ProjectContext): RegistryToken[] {
  return project.registry.tokens.filter((t) => t.type === "fontFamily");
}

function familiesOf(token: RegistryToken): string[] {
  const value = token.resolved;
  if (Array.isArray(value)) return value.map(normalizeFamily);
  if (typeof value === "string") return splitTopLevelCommas(value).map(normalizeFamily);
  return [];
}

interface FamilyCheck {
  unapproved: string[];
  matchingToken: RegistryToken | undefined;
  literalCount: number;
  badVariables: { name: string; token?: RegistryToken }[];
}

/** Evaluates a font-family list. Families are compared exactly after normalization, never by substring. */
function evaluateFamilies(ctx: RuleContext, value: string): FamilyCheck {
  const tokens = familyTokens(ctx.project);
  const approved = new Set(tokens.flatMap(familiesOf));
  const fallbacks = new Set(ctx.project.config.policies.fontFallbacks.map(normalizeFamily));
  const parts = splitTopLevelCommas(value);
  const result: FamilyCheck = { unapproved: [], matchingToken: undefined, literalCount: 0, badVariables: [] };
  const literals: string[] = [];
  for (const part of parts) {
    const variable = soleVarReference(part);
    if (variable) {
      const token = tokenForVariable(ctx.project, variable);
      if (token?.type === "fontFamily") continue;
      if (token) result.badVariables.push({ name: variable, token });
      else if (hasCssTokens(ctx.project) && !isLocalOrInternalVariable(ctx.file, variable))
        result.badVariables.push({ name: variable });
      continue;
    }
    const family = normalizeFamily(part);
    if (fallbacks.has(family)) continue;
    literals.push(family);
    if (!approved.has(family)) result.unapproved.push(part.trim());
  }
  result.literalCount = literals.length;
  if (literals.length > 0) {
    result.matchingToken = tokens.find((t) => {
      const fam = familiesOf(t);
      return literals.every((l) => fam.includes(l));
    });
  }
  return result;
}

function reportFamilies(
  ctx: RuleContext,
  value: string,
  loc: Loc,
  evidence: string,
  subject: string,
  context: HintContext,
): void {
  if (CSS_WIDE_KEYWORDS.has(value.trim().toLowerCase())) return;
  const check = evaluateFamilies(ctx, value);
  const tokens = familyTokens(ctx.project);
  for (const bad of check.badVariables) {
    ctx.report({
      loc,
      message: bad.token
        ? `var(${bad.name}) is a ${bad.token.type} token, not a font-family token`
        : `var(${bad.name}) is not a registered font-family token`,
      evidence,
      suggestion: "Reference a registered font-family token.",
      confidence: "medium",
      maxSeverity: "warning",
      subject: bad.name,
    });
  }
  if (check.literalCount === 0) return;
  if (check.unapproved.length > 0) {
    ctx.report({
      loc,
      message: `Font famil${check.unapproved.length === 1 ? "y" : "ies"} ${check.unapproved.join(", ")} not approved by any font-family token`,
      evidence,
      suggestion:
        tokens.length > 0
          ? `Use ${tokens
              .slice(0, 3)
              .map((t) => referenceHint(ctx.project, t, context))
              .join(
                ", ",
              )}. Generic fallbacks allowed by policy: ${ctx.project.config.policies.fontFallbacks.slice(0, 4).join(", ")}, ...`
          : "Register font-family tokens (designrail import-tokens) and reference one.",
      confidence: "high",
      subject,
    });
    return;
  }
  if (ctx.project.config.policies.rawValues === "forbid") {
    const token = check.matchingToken;
    ctx.report({
      loc,
      message: "Literal font-family list repeats approved families instead of referencing the token",
      evidence,
      suggestion: token
        ? `Use ${referenceHint(ctx.project, token, context)} (${token.name}).`
        : "Reference the matching font-family token.",
      confidence: "high",
      subject,
      ...(token ? { token: token.name } : {}),
    });
  }
}

function checkDeclaration(ctx: RuleContext, decl: StyleDeclaration): void {
  if (decl.isCustomPropertyDefinition) return;
  if (decl.property === "font-family") {
    reportFamilies(ctx, decl.value, decl.loc, declarationEvidence(decl), decl.value, CSS_CONTEXT);
  } else if (
    decl.property === "font" &&
    !soleVarReference(decl.value) &&
    !CSS_WIDE_KEYWORDS.has(decl.value.trim().toLowerCase())
  ) {
    ctx.coverage({
      loc: decl.loc,
      kind: "font-shorthand",
      detail: `font shorthand "${decl.value}" is not parsed; use font-family with a token to make it checkable`,
    });
  }
}

function checkClass(ctx: RuleContext, token: ClassToken, unknown: Map<string, Loc>): void {
  const { parsed } = token;
  if (parsed.arbitraryProperty?.property === "font-family") {
    reportFamilies(
      ctx,
      parsed.arbitraryProperty.value,
      token.loc,
      classEvidence(token.raw),
      token.raw,
      FONT_CLASS,
    );
    return;
  }
  if (parsed.prefix !== "font" || !parsed.value) return;
  const value = parsed.value;
  if (value.kind === "arbitrary") {
    const raw = value.raw.trim();
    const isWeight =
      value.hint === "number" ||
      value.hint === "weight" ||
      /^\d+$/.test(raw) ||
      /^var\(--[^)]*weight/i.test(raw);
    if (isWeight) return;
    if (value.hint === "family-name" || /['",]/.test(raw) || /^[A-Za-z]/.test(raw)) {
      reportFamilies(ctx, raw, token.loc, classEvidence(token.raw), token.raw, FONT_CLASS);
    }
    return;
  }
  if (value.kind === "var") {
    if (value.hint === "family-name")
      reportFamilies(ctx, `var(${value.name})`, token.loc, classEvidence(token.raw), token.raw, FONT_CLASS);
    return;
  }
  const key = value.key;
  if (/^(stretch|features|variant)-/.test(key)) return;
  if (
    tokenForKey(ctx.project, "fontFamily", key) ||
    tokenForKey(ctx.project, "fontWeight", key) ||
    FONT_WEIGHT_KEYS.has(key)
  )
    return;
  if (TAILWIND_DEFAULT_FAMILIES.has(key) && familyTokens(ctx.project).length > 0) {
    ctx.report({
      loc: token.loc,
      message: `${token.raw} uses Tailwind's default "${key}" font stack, which is not a registered font-family token`,
      evidence: classEvidence(token.raw),
      suggestion: `Use ${familyTokens(ctx.project)
        .slice(0, 3)
        .map((t) => referenceHint(ctx.project, t, FONT_CLASS))
        .join(", ")}.`,
      confidence: "medium",
      maxSeverity: "warning",
      subject: token.raw,
    });
    return;
  }
  if (!TAILWIND_DEFAULT_FAMILIES.has(key) && !unknown.has(token.raw)) unknown.set(token.raw, token.loc);
}

export const dr003: Rule = {
  id: "DR003",
  name: "unapproved-font-family",
  description:
    "font-family values and Tailwind font utilities that do not reference approved font-family tokens (with configured generic fallbacks).",
  defaultSeverity: "error",
  languages: ["tsx", "jsx", "ts", "js", "css"],
  check(ctx) {
    if (!ctx.file.isTokenDefinitionFile)
      for (const decl of ctx.file.declarations) checkDeclaration(ctx, decl);
    const unknown = new Map<string, Loc>();
    if (
      ctx.project.config.project.styling.tailwind !== "none" ||
      ctx.file.classTokens.some((t) => t.origin === "css-apply")
    ) {
      for (const token of ctx.file.classTokens) checkClass(ctx, token, unknown);
    }
    for (const [raw, loc] of unknown) {
      ctx.coverage({
        loc,
        kind: "unresolved-tailwind-font",
        detail: `${raw}: font key is not a registered family or weight token`,
      });
    }
  },
};
