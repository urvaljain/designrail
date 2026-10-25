import valueParser from "postcss-value-parser";
import { CSS_WIDE_KEYWORDS } from "../parsers/css-values.js";
import type { Rule, RuleContext, StyleDeclaration } from "../types.js";
import { tokenForVariable } from "./shared.js";

/** True when a value is built only from registered token references, keywords, and unitless numbers. */
function isTokenReferenceValue(ctx: RuleContext, decl: StyleDeclaration): boolean {
  const value = decl.value.trim();
  if (CSS_WIDE_KEYWORDS.has(value.toLowerCase()) || value === "0") return true;
  let sawToken = false;
  let ok = true;
  const visit = (nodes: valueParser.Node[]): void => {
    for (const n of nodes) {
      if (!ok) return;
      if (n.type === "function") {
        if (n.value.toLowerCase() === "var") {
          const first = n.nodes.find((x) => x.type === "word");
          if (first && tokenForVariable(ctx.project, first.value)) sawToken = true;
          else ok = false;
        } else if (["calc", "min", "max", "clamp"].includes(n.value.toLowerCase())) {
          visit(n.nodes);
        } else {
          ok = false;
        }
      } else if (n.type === "word") {
        if (!/^-?\d*\.?\d+$/.test(n.value) && !["+", "-", "*", "/"].includes(n.value)) ok = false;
      } else if (n.type === "string") {
        ok = false;
      }
    }
  };
  visit(valueParser(value).nodes);
  return ok && sawToken;
}

export const dr005: Rule = {
  id: "DR005",
  name: "inline-style-policy",
  description:
    "JSX style attributes, checked against policies.inlineStyles (forbid | allow-token-references | allow). Values already reported by DR001-DR003 are not reported again.",
  defaultSeverity: "warning",
  languages: ["tsx", "jsx", "js", "ts"],
  check(ctx) {
    const policy = ctx.project.config.policies.inlineStyles;
    if (policy === "allow") return;
    const reported = new Set(
      ctx
        .priorFindings()
        .filter((f) => f.ruleId === "DR001" || f.ruleId === "DR002" || f.ruleId === "DR003")
        .map((f) => `${f.loc.line}:${f.loc.column}`),
    );
    ctx.file.styleAttributes.forEach((attr) => {
      if (policy === "forbid") {
        ctx.report({
          loc: attr.loc,
          message: `Inline style on <${attr.element}> is not allowed (policies.inlineStyles: forbid)`,
          evidence: "style={...}",
          suggestion: "Move styling to classes or CSS that reference tokens.",
          confidence: "high",
          subject: "style",
        });
        return;
      }
      for (const index of attr.declarations) {
        const decl = ctx.file.declarations[index]!;
        if (decl.isCustomPropertyDefinition) continue;
        if (reported.has(`${decl.loc.line}:${decl.loc.column}`)) continue;
        if (isTokenReferenceValue(ctx, decl)) continue;
        ctx.report({
          loc: decl.loc,
          message: `Inline style ${decl.property}: ${decl.value} is not a token reference (policies.inlineStyles: allow-token-references)`,
          evidence: `${decl.property}: ${decl.value}`,
          suggestion:
            "Reference a token with var(--token), move the style to a class, or add an approved exception for intentional runtime styling.",
          confidence: "high",
          subject: decl.property,
        });
      }
    });
  },
};
