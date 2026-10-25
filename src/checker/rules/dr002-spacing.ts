import valueParser from "postcss-value-parser";
import { CSS_WIDE_KEYWORDS, parseDimension, splitSpaceComponents } from "../parsers/css-values.js";
import { SPACING_PREFIX_SET } from "../parsers/tailwind.js";
import type { ClassToken, Loc, Rule, RuleContext, RuleFinding, StyleDeclaration } from "../types.js";
import {
  CSS_CONTEXT,
  type HintContext,
  classEvidence,
  declarationEvidence,
  describeTokens,
  hasCssTokens,
  isLocalOrInternalVariable,
  nearestSpacingTokens,
  spacingTokensEqualTo,
  tokenForKey,
  tokenForVariable,
} from "./shared.js";

const SPACING_PROPERTY =
  /^(margin|padding)(-(top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?$|^(gap|row-gap|column-gap|grid-gap|grid-row-gap|grid-column-gap)$/;

type Verdict =
  | { kind: "ok" }
  | {
      kind: "violation";
      message: string;
      suggestion: string;
      confidence: RuleFinding["confidence"];
      maxSeverity?: RuleFinding["maxSeverity"];
      token?: string;
      subject: string;
    };

const OK: Verdict = { kind: "ok" };

function literalVerdict(ctx: RuleContext, text: string, context: HintContext = CSS_CONTEXT): Verdict {
  const { policies } = ctx.project.config;
  const dim = parseDimension(text);
  if (!dim) return OK;
  if (dim.number === 0) {
    return policies.spacing.zero === "allow"
      ? OK
      : {
          kind: "violation",
          message: "Zero spacing is flagged by policy (policies.spacing.zero: flag)",
          suggestion: "Use a spacing token.",
          confidence: "high",
          subject: text,
        };
  }
  if (dim.unit === "%") {
    return policies.spacing.percentages === "allow"
      ? OK
      : {
          kind: "violation",
          message: `Percentage spacing ${text} is flagged by policy`,
          suggestion: "Use a spacing token, or set policies.spacing.percentages: allow.",
          confidence: "high",
          subject: text,
        };
  }
  if (dim.unit === "") return OK; // unitless non-zero values are invalid CSS lengths; not a design-token question
  const equal = spacingTokensEqualTo(ctx.project, text);
  if (equal.length > 0 && policies.rawValues === "allow-matching-tokens") return OK;
  const negative =
    dim.number < 0
      ? " (negative values reference a token with calc(-1 * var(--token)) or a negative utility)"
      : "";
  if (equal.length > 0) {
    return {
      kind: "violation",
      message: `Raw spacing value ${text} matches a token but does not reference it`,
      suggestion: `Use ${describeTokens(ctx.project, equal.slice(0, 2), context)}${negative}.`,
      confidence: "high",
      token: equal[0]!.name,
      subject: text,
    };
  }
  const nearest = nearestSpacingTokens(ctx.project, text);
  const count = ctx.project.registry.tokens.filter((t) => t.type === "spacing").length;
  return {
    kind: "violation",
    message: `Spacing value ${text} is not a registered spacing token`,
    suggestion:
      nearest.length > 0
        ? `Use the closest suitable token: ${describeTokens(ctx.project, nearest, context)}${negative}. If neither fits, ask for a new token or an exception.`
        : count > 0
          ? `Use one of the ${count} spacing tokens. None share the unit ${dim.unit}${ctx.project.config.policies.remBasePx === null ? " (set policies.remBasePx to compare px and rem)" : ""}.`
          : "Register spacing tokens (designrail import-tokens) and reference one, or add an approved exception.",
    confidence: "high",
    subject: text,
  };
}

function variableVerdict(ctx: RuleContext, name: string): Verdict {
  const token = tokenForVariable(ctx.project, name);
  if (token?.type === "spacing") return OK;
  if (token) {
    return {
      kind: "violation",
      message: `var(${name}) is a ${token.type} token (${token.name}), not a spacing token`,
      suggestion: "Reference a spacing token.",
      confidence: "high",
      maxSeverity: "warning",
      token: token.name,
      subject: name,
    };
  }
  if (!hasCssTokens(ctx.project) || isLocalOrInternalVariable(ctx.file, name)) return OK;
  return {
    kind: "violation",
    message: `var(${name}) is not a registered spacing token`,
    suggestion: "Use a registered spacing token, or register this variable with designrail import-tokens.",
    confidence: "medium",
    maxSeverity: "warning",
    subject: name,
  };
}

/** calc()/min()/max()/clamp(): with tokens-only, operands must be spacing tokens, unitless numbers, zero, or allowed percentages. */
function mathVerdict(ctx: RuleContext, node: valueParser.FunctionNode, text: string): Verdict {
  const policy = ctx.project.config.policies.spacing.calc;
  if (policy === "allow") return OK;
  if (policy === "flag")
    return {
      kind: "violation",
      message: `${node.value}() spacing expression is flagged by policy`,
      suggestion: "Use a spacing token, or set policies.spacing.calc.",
      confidence: "high",
      subject: text,
    };
  let verdict: Verdict = OK;
  const visit = (nodes: valueParser.Node[]): void => {
    for (const n of nodes) {
      if (verdict.kind !== "ok") return;
      if (n.type === "function") {
        if (n.value.toLowerCase() === "var") {
          const first = n.nodes.find((x) => x.type === "word");
          if (first) verdict = variableVerdict(ctx, first.value);
        } else if (n.value.toLowerCase() !== "env") {
          visit(n.nodes);
        }
      } else if (n.type === "word") {
        const dim = parseDimension(n.value);
        if (!dim || dim.unit === "" || dim.number === 0) continue;
        if (dim.unit === "%" && ctx.project.config.policies.spacing.percentages === "allow") continue;
        verdict = {
          kind: "violation",
          message: `Raw length ${n.value} inside ${node.value}() is not a spacing token`,
          suggestion: "Build the expression from spacing tokens only (policies.spacing.calc: tokens-only).",
          confidence: "high",
          subject: text,
        };
      }
    }
  };
  visit(node.nodes);
  return verdict;
}

function componentVerdict(
  ctx: RuleContext,
  text: string,
  allowAuto: boolean,
  context: HintContext = CSS_CONTEXT,
): Verdict {
  const lower = text.toLowerCase();
  if (CSS_WIDE_KEYWORDS.has(lower)) return OK;
  if (lower === "auto") {
    if (!allowAuto) return OK;
    return ctx.project.config.policies.spacing.auto === "allow"
      ? OK
      : {
          kind: "violation",
          message: "auto spacing is flagged by policy",
          suggestion: "Use a spacing token or set policies.spacing.auto: allow.",
          confidence: "high",
          subject: text,
        };
  }
  const nodes = valueParser(text).nodes.filter((n) => n.type !== "space");
  if (nodes.length === 1 && nodes[0]!.type === "function") {
    const fn = nodes[0] as valueParser.FunctionNode;
    const name = fn.value.toLowerCase();
    if (name === "var") {
      const first = fn.nodes.find((n) => n.type === "word");
      return first ? variableVerdict(ctx, first.value) : OK;
    }
    if (name === "env") return OK;
    if (["calc", "min", "max", "clamp"].includes(name)) return mathVerdict(ctx, fn, text);
    return OK;
  }
  return literalVerdict(ctx, text, context);
}

function report(ctx: RuleContext, verdict: Verdict, loc: Loc, evidence: string): void {
  if (verdict.kind !== "violation") return;
  ctx.report({
    loc,
    message: verdict.message,
    evidence,
    suggestion: verdict.suggestion,
    confidence: verdict.confidence,
    subject: verdict.subject,
    ...(verdict.maxSeverity ? { maxSeverity: verdict.maxSeverity } : {}),
    ...(verdict.token ? { token: verdict.token } : {}),
  });
}

function checkDeclaration(ctx: RuleContext, decl: StyleDeclaration): void {
  if (!SPACING_PROPERTY.test(decl.property)) return;
  const allowAuto = decl.property.startsWith("margin");
  for (const component of splitSpaceComponents(decl.value)) {
    report(ctx, componentVerdict(ctx, component, allowAuto), decl.loc, declarationEvidence(decl));
  }
}

function checkClass(ctx: RuleContext, token: ClassToken, unknown: Map<string, Loc>): void {
  const { parsed } = token;
  if (!parsed.prefix || !parsed.value || !SPACING_PREFIX_SET.has(parsed.prefix)) return;
  const evidence = classEvidence(token.raw);
  const value = parsed.value;
  const allowAuto = parsed.prefix.startsWith("m");
  if (value.kind === "arbitrary") {
    const text = parsed.negative ? `-${value.raw}` : value.raw;
    for (const component of splitSpaceComponents(text))
      report(
        ctx,
        componentVerdict(ctx, component, allowAuto, { kind: "class", prefix: parsed.prefix }),
        token.loc,
        evidence,
      );
    return;
  }
  if (value.kind === "var") {
    report(ctx, variableVerdict(ctx, value.name), token.loc, evidence);
    return;
  }
  const key = value.key;
  if (tokenForKey(ctx.project, "spacing", key)) return;
  if (key === "0") {
    report(ctx, literalVerdict(ctx, "0"), token.loc, evidence);
    return;
  }
  if (key === "auto") {
    if (allowAuto && ctx.project.config.policies.spacing.auto === "flag")
      report(ctx, componentVerdict(ctx, "auto", true), token.loc, evidence);
    return;
  }
  const numeric = /^\d+(\.\d+)?$/.test(key) || key === "px";
  if (numeric) {
    const policy = ctx.project.config.policies.tailwind.numericSpacing;
    if (policy === "allow") return;
    if (policy === "flag") {
      ctx.report({
        loc: token.loc,
        message: `${token.raw} uses Tailwind's numeric spacing scale, which is not approved (policies.tailwind.numericSpacing: flag)`,
        evidence,
        suggestion: "Use a token-backed spacing key from designrail/tokens.json.",
        confidence: "high",
        subject: token.raw,
      });
      return;
    }
  }
  if (!unknown.has(token.raw)) unknown.set(token.raw, token.loc);
}

export const dr002: Rule = {
  id: "DR002",
  name: "unapproved-spacing",
  description:
    "Margin, padding, and gap values that are not spacing tokens, in CSS, inline styles, and Tailwind spacing utilities with known mappings.",
  defaultSeverity: "error",
  languages: ["tsx", "jsx", "ts", "js", "css"],
  check(ctx) {
    if (!ctx.file.isTokenDefinitionFile) {
      for (const decl of ctx.file.declarations) checkDeclaration(ctx, decl);
    }
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
        kind: "unresolved-tailwind-spacing",
        detail: `${raw}: spacing key is not a registered token and its value is unknown (see policies.tailwind.numericSpacing)`,
      });
    }
  },
};
