import { findColorLiterals, soleVarReference, varReferences } from "../parsers/css-values.js";
import {
  COLOR_KEYWORD_KEYS,
  COLOR_ONLY_PREFIXES,
  COLOR_PREFIX_SET,
  DEFAULT_PALETTE,
} from "../parsers/tailwind.js";
import type { ClassToken, Rule, RuleContext, StyleDeclaration } from "../types.js";
import {
  CSS_CONTEXT,
  type HintContext,
  classEvidence,
  colorTokensEqualTo,
  declarationEvidence,
  describeTokens,
  hasCssTokens,
  isLocalOrInternalVariable,
  tokenForKey,
  tokenForVariable,
} from "./shared.js";

/** Properties whose whole value is a single color, where a var() should be a color token. */
const PURE_COLOR_PROPERTIES = new Set([
  "color",
  "background-color",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-inline-color",
  "border-block-color",
  "outline-color",
  "fill",
  "stroke",
  "text-decoration-color",
  "caret-color",
  "accent-color",
  "column-rule-color",
  "stop-color",
  "flood-color",
]);

/** Arbitrary-value hints that mean the value is not a color (e.g. bg-[url:...], text-[length:...]). */
const NON_COLOR_HINTS = new Set([
  "length",
  "size",
  "url",
  "image",
  "position",
  "percentage",
  "number",
  "family-name",
  "absolute-size",
  "relative-size",
  "line-width",
  "integer",
  "angle",
]);

function colorSuggestion(
  ctx: RuleContext,
  literal: string,
  context: HintContext = CSS_CONTEXT,
): { text: string; token?: string } {
  const equal = colorTokensEqualTo(ctx.project, literal);
  if (equal.length > 0) {
    return {
      text: `Use ${describeTokens(ctx.project, equal.slice(0, 2), context)} instead of the raw value.`,
      token: equal[0]!.name,
    };
  }
  const count = ctx.project.registry.tokens.filter((t) => t.type === "color").length;
  if (count === 0)
    return {
      text: "Register color tokens (designrail import-tokens) and reference one, or add an approved exception.",
    };
  return {
    text: `Use one of the ${count} registered color tokens (see designrail/tokens.json), or ask for a new token or an approved exception.`,
  };
}

function paletteSuggestion(ctx: RuleContext): string {
  const keyed = ctx.project.registry.tokens.filter(
    (t) => t.type === "color" && t.references?.tailwindKeys?.length,
  );
  const hint = "or set policies.tailwind.defaultPalette: allow if the default palette is approved";
  if (keyed.length === 0) return `Register semantic color tokens with Tailwind keys, ${hint}.`;
  const examples = keyed
    .slice(0, 6)
    .map((t) => t.references!.tailwindKeys![0]!)
    .join(", ");
  return `Use a registered color key (for example ${examples}), ${hint}.`;
}

function allowedAsMatchingToken(ctx: RuleContext, literal: string): boolean {
  return (
    ctx.project.config.policies.rawValues === "allow-matching-tokens" &&
    colorTokensEqualTo(ctx.project, literal).length > 0
  );
}

function checkUnknownVariable(
  ctx: RuleContext,
  name: string,
  loc: StyleDeclaration["loc"],
  evidence: string,
): void {
  if (!hasCssTokens(ctx.project) || isLocalOrInternalVariable(ctx.file, name)) return;
  const token = tokenForVariable(ctx.project, name);
  if (token && token.type === "color") return;
  ctx.report({
    loc,
    message: token
      ? `var(${name}) is a ${token.type} token (${token.name}), not a color token`
      : `var(${name}) is not a registered color token`,
    evidence,
    suggestion: token
      ? "Reference a color token here."
      : "Use a registered color token, or register this variable with designrail import-tokens.",
    confidence: "medium",
    subject: name,
    maxSeverity: "warning",
    ...(token ? { token: token.name } : {}),
  });
}

function checkDeclaration(ctx: RuleContext, decl: StyleDeclaration): void {
  const evidence = declarationEvidence(decl);
  for (const literal of findColorLiterals(decl.value)) {
    if (allowedAsMatchingToken(ctx, literal.text)) continue;
    const suggestion = colorSuggestion(ctx, literal.text);
    ctx.report({
      loc: decl.loc,
      message: decl.isCustomPropertyDefinition
        ? `Custom property ${decl.property} defines a hard-coded color ${literal.text} outside a token definition file`
        : `Hard-coded color ${literal.text} in ${decl.property}`,
      evidence,
      suggestion: suggestion.text,
      confidence: "high",
      subject: literal.text,
      ...(suggestion.token ? { token: suggestion.token } : {}),
    });
  }
  for (const ref of varReferences(decl.value)) {
    if (!ref.fallback || tokenForVariable(ctx.project, ref.name)) continue;
    for (const literal of findColorLiterals(ref.fallback)) {
      if (allowedAsMatchingToken(ctx, literal.text)) continue;
      ctx.report({
        loc: decl.loc,
        message: `Hard-coded fallback color ${literal.text} for unregistered var(${ref.name})`,
        evidence,
        suggestion: colorSuggestion(ctx, literal.text).text,
        confidence: "high",
        subject: literal.text,
      });
    }
  }
  if (PURE_COLOR_PROPERTIES.has(decl.property) && !decl.isCustomPropertyDefinition) {
    const variable = soleVarReference(decl.value);
    if (variable) checkUnknownVariable(ctx, variable, decl.loc, evidence);
  }
}

function checkClass(ctx: RuleContext, token: ClassToken): void {
  const parsed = token.parsed;
  const evidence = classEvidence(token.raw);
  if (parsed.arbitraryProperty) {
    for (const literal of findColorLiterals(parsed.arbitraryProperty.value)) {
      if (allowedAsMatchingToken(ctx, literal.text)) continue;
      ctx.report({
        loc: token.loc,
        message: `Hard-coded color ${literal.text} in arbitrary property ${parsed.arbitraryProperty.property}`,
        evidence,
        suggestion: colorSuggestion(ctx, literal.text).text,
        confidence: "high",
        subject: token.raw,
      });
    }
    return;
  }
  if (!parsed.prefix || !parsed.value || !COLOR_PREFIX_SET.has(parsed.prefix)) return;
  const value = parsed.value;
  if (value.kind === "arbitrary") {
    if (value.hint && NON_COLOR_HINTS.has(value.hint)) return;
    for (const literal of findColorLiterals(value.raw)) {
      if (allowedAsMatchingToken(ctx, literal.text)) continue;
      const suggestion = colorSuggestion(ctx, literal.text, { kind: "class", prefix: parsed.prefix });
      ctx.report({
        loc: token.loc,
        message: `Hard-coded color ${literal.text} in arbitrary value ${token.raw}`,
        evidence,
        suggestion: suggestion.text,
        confidence: "high",
        subject: token.raw,
        ...(suggestion.token ? { token: suggestion.token } : {}),
      });
    }
    const variable = soleVarReference(value.raw);
    if (variable && (COLOR_ONLY_PREFIXES.has(parsed.prefix) || value.hint === "color"))
      checkUnknownVariable(ctx, variable, token.loc, evidence);
    return;
  }
  if (value.kind === "var") {
    if (COLOR_ONLY_PREFIXES.has(parsed.prefix) || value.hint === "color")
      checkUnknownVariable(ctx, value.name, token.loc, evidence);
    return;
  }
  const key = value.key;
  if (COLOR_KEYWORD_KEYS.has(key) || tokenForKey(ctx.project, "color", key)) return;
  if (ctx.project.config.policies.tailwind.defaultPalette === "flag" && DEFAULT_PALETTE.test(key)) {
    ctx.report({
      loc: token.loc,
      message: `${token.raw} uses Tailwind's default palette color "${key}" instead of a registered color token`,
      evidence,
      suggestion: paletteSuggestion(ctx),
      confidence: "high",
      subject: token.raw,
    });
  }
}

export const dr001: Rule = {
  id: "DR001",
  name: "hard-coded-color",
  description:
    "Literal colors (hex, rgb/rgba, hsl/hsla, and other CSS color functions) in style declarations and Tailwind classes, plus Tailwind default-palette utilities when that policy is enabled.",
  defaultSeverity: "error",
  languages: ["tsx", "jsx", "ts", "js", "css"],
  check(ctx) {
    if (!ctx.file.isTokenDefinitionFile) {
      for (const decl of ctx.file.declarations) checkDeclaration(ctx, decl);
    }
    if (
      ctx.project.config.project.styling.tailwind !== "none" ||
      ctx.file.classTokens.some((t) => t.origin === "css-apply")
    ) {
      for (const token of ctx.file.classTokens) checkClass(ctx, token);
    }
  },
};
